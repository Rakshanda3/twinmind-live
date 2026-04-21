export type TranscriptChunk = {
  id: string;
  text: string;
  timestamp: string;
};

export type SuggestionType =
  | "question"
  | "talking_point"
  | "answer"
  | "fact_check"
  | "clarification";

export type Suggestion = {
  id: string;
  type: SuggestionType;
  preview: string;
};

export type SuggestionBatch = {
  id: string;
  timestamp: string;
  suggestions: Suggestion[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
};

export type AppSettings = {
  groqApiKey: string;
  liveSuggestionPrompt: string;
  detailedAnswerPrompt: string;
  chatPrompt: string;
  liveContextChunks: number;
  expandedContextChunks: number;
  refreshIntervalMs: number;
};