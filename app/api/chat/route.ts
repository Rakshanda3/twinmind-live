import { NextRequest, NextResponse } from "next/server";
import { groqChatCompletion } from "@/lib/groq";

type HistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
    const systemPrompt =
      typeof body.systemPrompt === "string" && body.systemPrompt.trim()
        ? body.systemPrompt.trim()
        : "You are a helpful real-time meeting copilot.";
    const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
    const userMessage = typeof body.userMessage === "string" ? body.userMessage.trim() : "";

    // chatHistory from page.tsx includes the current user message as its last entry
    // (it's appended before the fetch). Strip it to avoid sending it twice.
    const rawHistory: HistoryMessage[] = Array.isArray(body.chatHistory)
      ? body.chatHistory.filter(
          (m: unknown): m is HistoryMessage =>
            typeof m === "object" &&
            m !== null &&
            "role" in m &&
            "text" in m &&
            ((m as HistoryMessage).role === "user" ||
              (m as HistoryMessage).role === "assistant") &&
            typeof (m as HistoryMessage).text === "string"
        )
      : [];

    const chatHistory = rawHistory.slice(0, -1);

    if (!apiKey) {
      return NextResponse.json({ error: "Missing Groq API key" }, { status: 400 });
    }
    if (!userMessage) {
      return NextResponse.json({ error: "Missing user message" }, { status: 400 });
    }

    // ── Transcript in system prompt ───────────────────────────────────────────
    //
    // Sending the transcript as a user message causes the model to lose grounding
    // to it as chat history accumulates — the model sees it as a conversational
    // turn that gets "pushed away" by recency bias. Embedding it in the system
    // prompt makes it authoritative context that persists across all turns.
    //
    const transcriptBlock = transcript
      ? `\n\n---\nMEETING TRANSCRIPT (treat as ground truth — do not say info is absent if it appears here):\n\n${transcript}\n\n---`
      : `\n\n---\nMEETING TRANSCRIPT: [No transcript yet — answer from general knowledge and label it as such.]\n---`;

    const fullSystemPrompt = systemPrompt + transcriptBlock;

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: fullSystemPrompt },
      ...chatHistory.map((m) => ({ role: m.role, content: m.text })),
      { role: "user", content: userMessage },
    ];

    const result = await groqChatCompletion({
      apiKey,
      messages,
      temperature: 0.3,
      max_tokens: 600,
    });

    const content = result?.choices?.[0]?.message?.content ?? "";

    return NextResponse.json({ answer: content });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat failed" },
      { status: 500 }
    );
  }
}