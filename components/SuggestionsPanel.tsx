"use client";

import { useEffect, useRef, useState } from "react";
import type { SuggestionBatch, SuggestionType } from "@/lib/types";

type Props = {
  suggestionBatches: SuggestionBatch[];
  onSuggestionClick: (text: string) => void;
  onReload: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
  refreshIntervalMs: number;
};

function badgeClass(type: SuggestionType): string {
  const map: Record<SuggestionType, string> = {
    question: "badge badge-question",
    talking_point: "badge badge-talking",
    answer: "badge badge-answer",
    fact_check: "badge badge-fact",
    clarification: "badge badge-clarification",
  };
  return map[type] ?? "badge";
}

function badgeLabel(type: SuggestionType): string {
  const map: Record<SuggestionType, string> = {
    question: "Question to ask",
    talking_point: "Talking point",
    answer: "Answer",
    fact_check: "Fact-check",
    clarification: "Clarification",
  };
  return map[type] ?? type.replace("_", " ");
}

export default function SuggestionsPanel({
  suggestionBatches,
  onSuggestionClick,
  onReload,
  isLoading,
  error,
  refreshIntervalMs,
}: Props) {
  const [countdown, setCountdown] = useState(Math.round(refreshIntervalMs / 1000));
  const lastReloadRef = useRef<number>(Date.now());
  const countdownRef = useRef<number | null>(null);

  // Reset countdown whenever a new batch lands (isLoading just finished).
  useEffect(() => {
    if (isLoading) return;
    lastReloadRef.current = Date.now();
    setCountdown(Math.round(refreshIntervalMs / 1000));

    if (countdownRef.current !== null) window.clearInterval(countdownRef.current);

    countdownRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastReloadRef.current) / 1000);
      const remaining = Math.max(0, Math.round(refreshIntervalMs / 1000) - elapsed);
      setCountdown(remaining);
    }, 1000);

    return () => {
      if (countdownRef.current !== null) window.clearInterval(countdownRef.current);
    };
  }, [suggestionBatches, isLoading, refreshIntervalMs]);

  async function handleReload() {
    if (isLoading) return;
    await onReload();
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">2. Live Suggestions</div>
        <div className="panel-subtitle">
          {suggestionBatches.length} BATCH{suggestionBatches.length !== 1 ? "ES" : ""}
        </div>
      </div>

      {/* Reload toolbar */}
      <div className="suggestions-toolbar">
        <button className="reload-btn" onClick={handleReload} disabled={isLoading}>
          <span className={isLoading ? "spin" : ""}>↺</span>
          {isLoading ? "Loading…" : "Reload suggestions"}
        </button>
        <div className="auto-refresh-label">
          {isLoading ? "refreshing…" : countdown > 0 ? `auto-refresh in ${countdown}s` : "refreshing…"}
        </div>
      </div>

      {/* Info */}
      <div className="info-box">
        On reload (or auto every ~{Math.round(refreshIntervalMs / 1000)}s), generate{" "}
        <strong>3 fresh suggestions</strong> from recent transcript context. Each is a tappable
        card: a <span style={{ color: "#93c5fd" }}>question to ask</span>, a{" "}
        <span style={{ color: "#d8b4fe" }}>talking point</span>, an{" "}
        <span style={{ color: "#86efac" }}>answer</span>, or a{" "}
        <span style={{ color: "#fde68a" }}>fact-check</span>. The preview alone should already be
        useful.
      </div>

      {/* Error state */}
      {error && (
        <div className="error-box">
          ⚠ {error}
        </div>
      )}

      {/* Suggestions */}
      <div className="scroll-area">
        {suggestionBatches.length === 0 && !isLoading ? (
          <div className="empty-state">
            {error ? "Could not load suggestions." : "No suggestions yet. Start recording or click Reload."}
          </div>
        ) : (
          suggestionBatches.map((batch, batchIndex) => (
            <div key={batch.id}>
              {batchIndex > 0 && (
                <div className="batch-divider">
                  BATCH {suggestionBatches.length - batchIndex} · {batch.timestamp}
                </div>
              )}

              <div className={`suggestion-batch ${batchIndex > 0 ? "stale" : ""}`}>
                {batch.suggestions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onSuggestionClick(s.preview)}
                    className="suggestion-card"
                  >
                    <div className={badgeClass(s.type)}>{badgeLabel(s.type)}</div>
                    <div className="text">{s.preview}</div>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}

        {/* Skeleton cards while loading first batch */}
        {isLoading && suggestionBatches.length === 0 && (
          <div className="suggestion-batch">
            {[0, 1, 2].map((i) => (
              <div key={i} className="suggestion-card skeleton">
                <div className="skeleton-badge" />
                <div className="skeleton-line" />
                <div className="skeleton-line short" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}