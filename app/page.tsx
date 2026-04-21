"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import TranscriptPanel from "@/components/TranscriptPanel";
import SuggestionsPanel from "@/components/SuggestionsPanel";
import ChatPanel from "@/components/ChatPanel";
import { defaultSettings } from "@/lib/prompts";
import type {
  AppSettings,
  ChatMessage,
  Suggestion,
  SuggestionBatch,
  SuggestionType,
  TranscriptChunk,
} from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowTime(): string {
  return new Date().toLocaleTimeString();
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isValidSuggestionType(type: string): type is SuggestionType {
  return ["question", "talking_point", "answer", "fact_check", "clarification"].includes(type);
}

type SuggestionApiItem = { type: string; preview: string };

/**
 * Generic fallbacks — only shown when the model returns zero valid suggestions.
 * Never quotes transcript text (formatted as "[timestamp] text" — looks broken quoted).
 */
function buildFallbacks(needed: number): Suggestion[] {
  if (needed <= 0) return [];
  return [
    { id: makeId(), type: "question" as SuggestionType,      preview: "Who owns this decision and what is the deadline for resolving it?" },
    { id: makeId(), type: "talking_point" as SuggestionType, preview: "Before committing to an approach, align on success criteria — what does a good outcome look like in 30 days?" },
    { id: makeId(), type: "clarification" as SuggestionType, preview: "Clarify which option is the default if no decision is made today — knowing the fallback often unblocks the room." },
  ].slice(0, needed);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [settings, setSettings]                   = useState<AppSettings>(defaultSettings);
  const [isRecording, setIsRecording]             = useState(false);
  const [transcriptChunks, setTranscriptChunks]   = useState<TranscriptChunk[]>([]);
  const [suggestionBatches, setSuggestionBatches] = useState<SuggestionBatch[]>([]);
  const [chatMessages, setChatMessages]           = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading]         = useState(false);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [suggestionError, setSuggestionError]     = useState<string | null>(null);

  // Recorder
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const mediaStreamRef    = useRef<MediaStream | null>(null);
  const stopTimeoutRef    = useRef<number | null>(null);
  const shouldContinueRef = useRef(false);
  const audioChunksRef    = useRef<BlobPart[]>([]);

  // Live refs — let async callbacks read current state without stale closures
  const transcriptRef = useRef<TranscriptChunk[]>([]);
  transcriptRef.current = transcriptChunks;

  const settingsRef = useRef<AppSettings>(defaultSettings);
  settingsRef.current = settings;

  // ── Load settings ─────────────────────────────────────────────────────────
  useEffect(() => {
    function load() {
      const raw = localStorage.getItem("twinmind-settings");
      if (!raw) return;
      try {
        setSettings({ ...defaultSettings, ...(JSON.parse(raw) as AppSettings) });
      } catch {
        setSettings(defaultSettings);
      }
    }
    load();
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", load);
    return () => {
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  // ── Expanded transcript for chat ──────────────────────────────────────────
  const expandedTranscript = useMemo(
    () =>
      transcriptChunks
        .slice(-settings.expandedContextChunks)
        .map((c) => `[${c.timestamp}] ${c.text}`)
        .join("\n"),
    [transcriptChunks, settings.expandedContextChunks]
  );

  // ── Generate suggestions ──────────────────────────────────────────────────
  // Called once after each transcription chunk. No setInterval — that caused
  // a race condition where two concurrent calls produced fallbacks every time.
  async function generateSuggestions(transcriptText: string): Promise<void> {
    const { groqApiKey, liveSuggestionPrompt } = settingsRef.current;
    if (!groqApiKey || !transcriptText.trim()) return;

    setSuggestionError(null);
    setIsSuggestionsLoading(true);

    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: groqApiKey,
          prompt: liveSuggestionPrompt,
          transcript: transcriptText,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Suggestions failed");

      const fromModel: Suggestion[] = Array.isArray(data.suggestions)
        ? (data.suggestions as SuggestionApiItem[])
            .slice(0, 3)
            .map((item) => ({
              id: makeId(),
              type: isValidSuggestionType(item.type) ? item.type : "clarification",
              preview: typeof item.preview === "string" ? item.preview.trim() : "",
            }))
            .filter((s) => s.preview.length > 15)
        : [];

      const fallbacks = fromModel.length < 3 ? buildFallbacks(3 - fromModel.length) : [];

      const batch: SuggestionBatch = {
        id: makeId(),
        timestamp: nowTime(),
        suggestions: [...fromModel, ...fallbacks].slice(0, 3),
      };

      setSuggestionBatches((prev) => [batch, ...prev]);
    } catch (err) {
      setSuggestionError(err instanceof Error ? err.message : "Failed to load suggestions");
    } finally {
      setIsSuggestionsLoading(false);
    }
  }

  // Manual reload — builds transcript from current ref
  async function handleReload(): Promise<void> {
    const { liveContextChunks } = settingsRef.current;
    const transcript = transcriptRef.current
      .slice(-liveContextChunks)
      .map((c) => `[${c.timestamp}] ${c.text}`)
      .join("\n");
    if (transcript.trim()) await generateSuggestions(transcript);
  }

  // ── Transcription ─────────────────────────────────────────────────────────
  async function transcribeBlob(blob: Blob): Promise<string> {
    const { groqApiKey } = settingsRef.current;
    if (!groqApiKey) return "";

    const formData = new FormData();
    formData.append("audio", new File([blob], "chunk.webm", { type: "audio/webm" }));
    formData.append("apiKey", groqApiKey);

    const res = await fetch("/api/transcribe", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Transcription failed");

    const text = typeof data.text === "string" ? data.text.trim() : "";
    if (text) {
      setTranscriptChunks((prev) => [...prev, { id: makeId(), text, timestamp: nowTime() }]);
    }
    return text;
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  async function askChat(message: string, promptOverride?: string): Promise<void> {
    if (!settings.groqApiKey) {
      alert("Please add your Groq API key in Settings.");
      return;
    }

    const systemPrompt =
      promptOverride?.trim() || settings.chatPrompt?.trim() || "You are a helpful meeting copilot.";

    const userMsg: ChatMessage = {
      id: makeId(),
      role: "user",
      text: message,
      timestamp: nowTime(),
    };

    // nextHistory includes current user msg — route strips the last entry to
    // avoid sending it twice (also sent as userMessage param separately).
    const nextHistory = [...chatMessages, userMsg];
    setChatMessages(nextHistory);
    setIsChatLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: settings.groqApiKey,
          systemPrompt,
          transcript: expandedTranscript,
          chatHistory: nextHistory.map((m) => ({ role: m.role, text: m.text })),
          userMessage: message,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat failed");

      setChatMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "assistant",
          text: typeof data.answer === "string" ? data.answer : "",
          timestamp: nowTime(),
        },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "assistant",
          text: `Error: ${err instanceof Error ? err.message : "Chat failed"}`,
          timestamp: nowTime(),
        },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  }

  // ── Recording ─────────────────────────────────────────────────────────────
  function clearRecorder(): void {
    if (stopTimeoutRef.current !== null) {
      window.clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaRecorderRef.current = null;
    mediaStreamRef.current = null;
    audioChunksRef.current = [];
  }

  async function startRecordingCycle(): Promise<void> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      throw new Error("Microphone permission denied. Please allow mic access in your browser.");
    }

    mediaStreamRef.current = stream;
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    audioChunksRef.current = [];

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      audioChunksRef.current = [];

      if (blob.size > 0) {
        try {
          const newText = await transcribeBlob(blob);

          if (newText.trim()) {
            // Read from ref — avoids stale closure bug where transcriptChunks
            // captured at recorder creation time is used instead of current.
            const { liveContextChunks } = settingsRef.current;
            const current = transcriptRef.current;
            const withNew = [...current, { id: "tmp", text: newText, timestamp: nowTime() }];
            const transcriptText = withNew
              .slice(-liveContextChunks)
              .map((c) => `[${c.timestamp}] ${c.text}`)
              .join("\n");

            // Single suggestion call per cycle — no concurrent timer calls
            await generateSuggestions(transcriptText);
          }
        } catch (err) {
          console.error("Recording cycle error:", err);
        }
      }

      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current = null;
      mediaStreamRef.current = null;

      if (shouldContinueRef.current) {
        try {
          await startRecordingCycle();
        } catch (err) {
          console.error("Restart failed:", err);
          setIsRecording(false);
          shouldContinueRef.current = false;
          alert(err instanceof Error ? err.message : "Microphone access failed.");
        }
      }
    };

    recorder.start();

    // Stop after refreshIntervalMs → onstop fires → transcribe → suggestions → restart
    stopTimeoutRef.current = window.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, settingsRef.current.refreshIntervalMs);
  }

  async function toggleRecording(): Promise<void> {
    if (!settings.groqApiKey) {
      alert("Please add your Groq API key in Settings first.");
      return;
    }
    if (isRecording) {
      shouldContinueRef.current = false;
      setIsRecording(false);
      clearRecorder();
      return;
    }
    try {
      shouldContinueRef.current = true;
      await startRecordingCycle();
      setIsRecording(true);
    } catch (err) {
      shouldContinueRef.current = false;
      setIsRecording(false);
      alert(err instanceof Error ? err.message : "Microphone access failed.");
    }
  }

  useEffect(() => {
    return () => {
      shouldContinueRef.current = false;
      clearRecorder();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Export ────────────────────────────────────────────────────────────────
  function exportSession(): void {
    const payload = {
      exportedAt: new Date().toISOString(),
      transcriptChunks,
      suggestionBatches,
      chatMessages,
      activePrompts: {
        liveSuggestionPrompt: settings.liveSuggestionPrompt,
        detailedAnswerPrompt: settings.detailedAnswerPrompt,
        chatPrompt: settings.chatPrompt,
      },
      sessionConfig: {
        liveContextChunks: settings.liveContextChunks,
        expandedContextChunks: settings.expandedContextChunks,
        refreshIntervalMs: settings.refreshIntervalMs,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `twinmind-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="page">
      <div className="topbar">
        <h1>TwinMind — Live Suggestions Web App</h1>
        <div className="topbar-actions">
          <div className="api-status">
            <span className={`status-dot ${settings.groqApiKey ? "active" : ""}`} />
            {settings.groqApiKey ? "API key: loaded" : "API key: missing"}
          </div>
          <Link href="/settings" className="top-btn">Settings</Link>
          <button onClick={exportSession} className="top-btn">Export Session</button>
        </div>
      </div>

      <div className="layout">
        <TranscriptPanel
          isRecording={isRecording}
          transcriptChunks={transcriptChunks}
          onToggleRecording={toggleRecording}
          onManualRefresh={handleReload}
        />
        <SuggestionsPanel
          suggestionBatches={suggestionBatches}
          onSuggestionClick={(msg) => askChat(msg, settings.detailedAnswerPrompt)}
          onReload={handleReload}
          isLoading={isSuggestionsLoading}
          error={suggestionError}
          refreshIntervalMs={settings.refreshIntervalMs}
        />
        <ChatPanel
          chatMessages={chatMessages}
          onSend={(msg) => askChat(msg, settings.chatPrompt)}
          isChatLoading={isChatLoading}
        />
      </div>
    </main>
  );
}