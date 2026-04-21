type ChatMessageInput = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function groqChatCompletion({
  apiKey,
  messages,
  model = "openai/gpt-oss-120b",
  temperature = 0.4,
  max_tokens = 800,
}: {
  apiKey: string;
  messages: ChatMessageInput[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
}) {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens,
  };

  // NOTE: We intentionally do NOT use response_format: json_object here.
  // Groq requires the word "json" to appear in the messages array when this
  // mode is enabled — if it doesn't, Groq returns a 400 error. Since the
  // live suggestion prompt is user-editable (and may not contain "json"),
  // we handle JSON parsing robustly in the route instead.

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error ${res.status}: ${text}`);
  }

  return res.json();
}

export async function groqTranscription({
  apiKey,
  file,
  model = "whisper-large-v3",
  language = "en",
}: {
  apiKey: string;
  file: File;
  model?: string;
  language?: string;
}) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", model);
  formData.append("response_format", "json");
  // Language hint skips Whisper's language-detection pass — saves ~200–400ms per chunk.
  formData.append("language", language);

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Whisper error ${res.status}: ${text}`);
  }

  return res.json();
}