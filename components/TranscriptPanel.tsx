"use client";

import { useEffect, useRef } from "react";
import type { TranscriptChunk } from "@/lib/types";

type Props = {
  isRecording: boolean;
  transcriptChunks: TranscriptChunk[];
  onToggleRecording: () => void;
  onManualRefresh: () => void;
};

export default function TranscriptPanel({
  isRecording,
  transcriptChunks,
  onToggleRecording,
  onManualRefresh,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcriptChunks]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">1. Mic &amp; Transcript</div>
        <div className="panel-subtitle">{isRecording ? "🔴 RECORDING" : "IDLE"}</div>
      </div>

      {/* Mic button */}
      <div className="mic-area">
        <button
          onClick={onToggleRecording}
          className={`mic-btn ${isRecording ? "recording" : "idle"}`}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          {isRecording ? (
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <rect x="5" y="5" width="14" height="14" rx="2" fill="white" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
                fill="white"
              />
              <path
                d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V23h2v-2.06A9 9 0 0 0 21 12v-2h-2z"
                fill="white"
              />
            </svg>
          )}
        </button>

        <div className="mic-status-text">
          {isRecording ? (
            <>
              <strong>Recording…</strong>
              <br />
              <span style={{ fontSize: 12, color: "#8f9bb3" }}>
                Transcript updates every ~30s
              </span>
            </>
          ) : (
            <>
              <strong>Stopped.</strong> Click to resume.
            </>
          )}
        </div>
      </div>

      {/* Manual refresh */}
      <div className="row">
        <button onClick={onManualRefresh} className="secondary-btn">
          <span>↺</span> Refresh Suggestions
        </button>
      </div>

      <div className="info-box">
        The transcript scrolls and appends new chunks every ~30 seconds while recording.
        Use the mic button to start/stop.
      </div>

      <div className="scroll-area">
        {transcriptChunks.length === 0 ? (
          <div className="empty-state">No transcript yet.</div>
        ) : (
          transcriptChunks.map((chunk) => (
            <div key={chunk.id} className="transcript-item">
              <div className="muted">{chunk.timestamp}</div>
              <div className="text">{chunk.text}</div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}