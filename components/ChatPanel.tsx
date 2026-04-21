"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import type { ChatMessage } from "@/lib/types";

type Props = {
  chatMessages: ChatMessage[];
  onSend: (message: string) => Promise<void>;
  isChatLoading: boolean;
};

export default function ChatPanel({ chatMessages, onSend, isChatLoading }: Props) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isChatLoading]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const value = input.trim();
    if (!value || isChatLoading) return;
    setInput("");
    await onSend(value);
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">3. Chat (Detailed Answers)</div>
        <div className="panel-subtitle">SESSION-ONLY</div>
      </div>

      <div className="info-box">
        Clicking a suggestion adds it to this chat and generates a detailed answer (separate
        prompt, more context). You can also type questions directly. One continuous chat per
        session — no login, no persistence.
      </div>

      <div className="scroll-area">
        {chatMessages.length === 0 ? (
          <div className="empty-state">Click a suggestion or type a question below.</div>
        ) : (
          chatMessages.map((msg) => (
            <div key={msg.id} className="chat-item">
              <div className="chat-role-label">
                <span>{msg.role === "user" ? "YOU" : "ASSISTANT"}</span>
                <span className="muted">{msg.timestamp}</span>
              </div>
              <div className={`chat-bubble ${msg.role}`}>
                {msg.role === "assistant" ? (
                  <div className="markdown-body">
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="text">{msg.text}</div>
                )}
              </div>
            </div>
          ))
        )}

        {isChatLoading && (
          <div className="chat-item">
            <div className="chat-role-label">
              <span>ASSISTANT</span>
            </div>
            <div className="chat-bubble assistant">
              <div className="typing-indicator">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="chat-form">
        <input
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything…"
          disabled={isChatLoading}
        />
        <button type="submit" className="primary-btn" disabled={isChatLoading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}