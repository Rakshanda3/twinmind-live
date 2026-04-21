# TwinMind — Live Suggestions Web App

Real-time AI meeting copilot. Listens to your mic, transcribes in 30-second chunks, surfaces 3 actionable suggestions per batch, and provides detailed answers on click.

---

## Quick Start

```bash
git clone <repo-url>
cd twinmind-live
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), go to **Settings**, paste your Groq API key, and click **Start Mic**.

### Deploy to Vercel

```bash
npx vercel --prod
```

No environment variables needed — the API key is stored in the user's browser localStorage and sent directly to Groq per request.

---

## Project Structure

```
app/
  page.tsx                    # Main app — mic, transcript, suggestions, chat
  layout.tsx                  # Root layout + metadata
  globals.css                 # All styles — single file, CSS classes only
  settings/
    page.tsx                  # Settings page (prompts, context windows, API key)
  api/
    transcribe/route.ts       # POST — audio blob → Whisper → text
    suggestions/route.ts      # POST — transcript → GPT-OSS 120B → 3 suggestions
    chat/route.ts             # POST — transcript + history + message → answer

components/
  TranscriptPanel.tsx         # Left column — mic button, transcript scroll
  SuggestionsPanel.tsx        # Middle column — suggestion cards, reload, countdown
  ChatPanel.tsx               # Right column — chat messages, input form
  SettingsPanel.tsx           # Settings form fields

lib/
  types.ts                    # Shared TypeScript types
  prompts.ts                  # Default prompts + settings (the prompt engineering)
  groq.ts                     # Groq API wrappers (chat completion + Whisper)
```

---

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 14 (App Router) | API routes + React in one repo, easy Vercel deploy |
| Language | TypeScript | Type safety across client/server boundary |
| Styling | Plain CSS (globals.css) | No build-time dependency, fast iteration |
| Transcription | Groq Whisper Large V3 | Required by spec; ~300ms for 30s chunks |
| LLM | Groq GPT-OSS 120B | Required by spec; fast inference |
| Storage | Browser localStorage | Session-only, no backend DB needed |

---

## How It Works

### Audio Pipeline

1. `MediaRecorder` captures mic audio in webm chunks.
2. Every `refreshIntervalMs` (default 30s) the recorder stops, the blob is sent to `/api/transcribe`.
3. Whisper returns the transcript text. It's appended to state and the recorder restarts.
4. Suggestions are generated immediately after each transcription using the latest N chunks.
5. A parallel `setInterval` timer also triggers suggestions as a safety net for silent periods.

**Stale closure fix:** Recording callbacks read transcript state via a `transcriptChunksRef` that mirrors state. This prevents the classic React stale closure bug where `recorder.onstop` captures the state value from when the recorder was created, not the current value.

### Suggestion Pipeline

```
Transcript (last 6 chunks)
  ↓
POST /api/suggestions
  ↓
System: liveSuggestionPrompt
User:   transcript + "do not repeat prior 3 previews"
  ↓
GPT-OSS 120B → JSON { suggestions: [...] }
  ↓
Robust parser (direct parse → regex fallback)
  ↓
SuggestionBatch prepended to list (newest at top)
```

### Chat Pipeline

```
User clicks suggestion → text added as user message
  ↓
POST /api/chat
  ↓
System: detailedAnswerPrompt + LIVE MEETING TRANSCRIPT block
Prior chat turns (stripped of duplicate current message)
User: clicked text or typed question
  ↓
GPT-OSS 120B → answer
  ↓
Assistant message appended to chat
```

**Why transcript in system prompt:** Sending the transcript as a user message causes the model to treat it as conversational input and lose grounding to it as chat history grows. Embedding it in the system prompt makes it authoritative context that persists across the full conversation window.

---

## Prompt Strategy

### The Core Problem

A generic meeting copilot that always shows "Ask a follow-up question / Summarize the discussion / Check alignment" is useless in a live meeting. The challenge is surfacing the *right type* of suggestion at the *right moment* — not just any suggestion.

### Decision Logic (applied in order)

The live suggestion prompt uses a priority-ordered decision table:

| Priority | Condition | Type |
|----------|-----------|------|
| 1 | A direct question was just asked | `answer` — give the actual answer |
| 2 | A specific claim or number was stated | `fact_check` — name what to verify and why |
| 3 | A key term is undefined in a decision-relevant way | `clarification` — name the gap exactly |
| 4 | An unraised risk or tradeoff exists | `talking_point` — introduce the angle |
| 5 | A clear next question would advance the conversation | `question` — write the exact words to say |

This ordering means: if someone just asked "what's our latency target?", we answer it rather than asking another question. If someone stated "we agreed to ship on May 15th", we surface a fact-check if that date is questionable.

**No forced variety.** If the transcript warrants 2 `answer` + 1 `fact_check`, the prompt outputs that. Forcing one of each type every batch produces lower-quality, less relevant suggestions.

### Why BAD/GOOD Examples in the Prompt

Positive rules alone ("be specific", "be direct") are insufficient. GPT-OSS 120B has a strong prior for hedging language (`likely`, `probably`, `e.g., Q2 ends June 30`). The only reliable suppression technique is showing the exact failure mode as a negative example alongside the correct behavior:

```
BAD: "Define 'starter tire' — likely the entry-level pricing tier for small teams."
GOOD: "Define 'starter tire': is it a separate SKU or a discount on existing plans? The choice determines margin impact."
```

This is applied for every suggestion type.

### Context Windows

| Setting | Default | Rationale |
|---------|---------|-----------|
| `liveContextChunks` | 6 | ~3 minutes of speech. Enough for a full conversational thread. More than this and the model starts weighting old context too heavily. |
| `expandedContextChunks` | 15 | ~7.5 minutes. Chat answers need more history for continuity. |
| `refreshIntervalMs` | 30000 | Matches Whisper chunk size. Shorter = more API cost + latency. Longer = suggestions lag the conversation. |

### Dedup Strategy

The route sends the 3 most recent suggestion previews to the model with `"Do NOT repeat these from the previous batch"`. Only 1 batch (3 items) — not 2 — because a larger dedup window over-blocks valid suggestions when the topic shifts.

### The "likely" Problem

Groq's GPT-OSS 120B frequently inserts hedging language into clarification cards:
> *"Define 'starter tire' — likely the entry-level pricing tier for small teams."*

This is not a clarification — it's an inference dressed as one. The prompt hard-bans `"likely"`, `"probably"`, `"presumably"` with explicit HARD FAIL markers and shows the exact rewrite. The rule is stated twice (in the global section and in the per-type clarification section) because single-mention rules drift.

### Why No `json_object` Mode

Groq's `response_format: { type: "json_object" }` requires the word "json" to appear in the messages array. Since the live suggestion prompt is user-editable (via Settings), a user could inadvertently remove it, causing a 400 `json_validate_failed` error. Instead, the user message always ends with `"Respond with a JSON object only. No markdown fences."` and the route uses a two-pass parser (direct parse → regex extract fallback).

---

## Latency

| Step | Typical | Notes |
|------|---------|-------|
| Whisper transcription | ~300ms | `language: "en"` hint skips detection pass |
| Suggestion generation | ~800ms–1.5s | GPT-OSS 120B on Groq is fast; prompt is ~600 tokens |
| Chat first token | ~400ms | Temperature 0.3, max_tokens 800 |

The recording cycle and auto-refresh timer run in parallel. When a transcription chunk completes, suggestions are generated immediately — the timer is a safety net for silent periods, not the primary trigger.

---

## Error Handling

- **No API key:** Alert on first attempt, no silent failures.
- **Suggestion API error:** Red error box displayed in suggestions panel. Previous batches stay visible.
- **Chat API error:** Error message appended as assistant message in chat thread.
- **Mic permission denied:** Alert with clear message, recording state rolled back.
- **Model returns invalid JSON:** Two-pass parser catches it. If truly unparseable, falls back to anchored fallback suggestions (not generic — rooted in the last transcript sentence).
- **Recording cycle crash:** `shouldContinueRecordingRef` prevents infinite restart loops. Error surfaced via alert.

---

## Tradeoffs

**30-second chunks vs shorter:** Shorter chunks would feel more responsive but increase API calls and cost. Whisper also performs better on longer audio (more context for ambiguous words). 30s is the spec requirement and a sensible default.

**No streaming:** The chat API returns the full answer at once. Streaming would improve perceived latency but adds complexity (edge runtime, ReadableStream handling). Given Groq's fast inference, full response time is typically under 2 seconds.

**localStorage for settings:** No backend storage means settings survive refresh but not across devices. For a demo/interview context this is correct — no login, no persistence required by spec.

**Single CSS file:** `globals.css` uses class-based styling without a CSS-in-JS library. This avoids hydration mismatches and keeps the bundle small. The tradeoff is no scoping — class names must be globally unique.

---

## Running the Evaluator's Export

The **Export Session** button downloads a JSON file containing:
- Full transcript with timestamps
- Every suggestion batch with timestamps and suggestion types
- Full chat history with role, text, and timestamps
- The active prompts at time of export (for reproducibility)
- Session config (context windows, refresh interval)

This file is what TwinMind uses to evaluate submissions.