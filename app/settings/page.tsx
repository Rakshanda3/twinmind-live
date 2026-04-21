"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { defaultSettings } from "@/lib/prompts";
import type { AppSettings } from "@/lib/types";

// ─── Inline SettingsPanel ─────────────────────────────────────────────────────
// Kept in the same file to avoid the undefined-settings race condition that
// occurs when the component tree renders before useState initializes.

function SettingsForm({
  settings,
  setSettings,
}: {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}) {
  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="settings-box">
      <p style={{ fontSize: 13, color: "#8f9bb3", marginBottom: 20, lineHeight: 1.6 }}>
        Your API key is stored only in your browser (localStorage) and sent directly to Groq — never to any other server.
      </p>

      {/* API */}
      <div style={{ fontSize: 11, fontWeight: 700, color: "#5a6680", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "monospace", marginBottom: 12 }}>API</div>

      <div className="field">
        <label>Groq API Key</label>
        <input
          type="password"
          value={settings.groqApiKey}
          onChange={(e) => update("groqApiKey", e.target.value)}
          placeholder="gsk_..."
          autoComplete="off"
        />
      </div>

      {/* Context Windows */}
      <div style={{ fontSize: 11, fontWeight: 700, color: "#5a6680", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "monospace", marginTop: 20, marginBottom: 12 }}>Context Windows</div>

      <div className="field">
        <label>Live Suggestion Context Chunks (default: 6 — ~3 min of speech)</label>
        <input
          type="number"
          min={1}
          max={20}
          value={settings.liveContextChunks}
          onChange={(e) => update("liveContextChunks", Math.max(1, Number(e.target.value) || 1))}
        />
      </div>

      <div className="field">
        <label>Chat / Expanded Context Chunks (default: 15 — ~7.5 min)</label>
        <input
          type="number"
          min={1}
          max={50}
          value={settings.expandedContextChunks}
          onChange={(e) => update("expandedContextChunks", Math.max(1, Number(e.target.value) || 1))}
        />
      </div>

      <div className="field">
        <label>Refresh Interval ms (default: 30000)</label>
        <input
          type="number"
          min={5000}
          step={1000}
          value={settings.refreshIntervalMs}
          onChange={(e) => update("refreshIntervalMs", Math.max(5000, Number(e.target.value) || 30000))}
        />
      </div>

      {/* Prompts */}
      <div style={{ fontSize: 11, fontWeight: 700, color: "#5a6680", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "monospace", marginTop: 20, marginBottom: 12 }}>Prompts</div>

      <div className="field">
        <label>Live Suggestion Prompt</label>
        <textarea
          rows={16}
          value={settings.liveSuggestionPrompt}
          onChange={(e) => update("liveSuggestionPrompt", e.target.value)}
        />
      </div>

      <div className="field">
        <label>Detailed Answer Prompt (on suggestion click)</label>
        <textarea
          rows={14}
          value={settings.detailedAnswerPrompt}
          onChange={(e) => update("detailedAnswerPrompt", e.target.value)}
        />
      </div>

      <div className="field">
        <label>Chat Prompt (direct typed questions)</label>
        <textarea
          rows={10}
          value={settings.chatPrompt}
          onChange={(e) => update("chatPrompt", e.target.value)}
        />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  // Initialize with defaultSettings so the form never renders with undefined.
  // The useEffect below overwrites with localStorage values once mounted.
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("twinmind-settings");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as AppSettings;
        // Merge with defaultSettings so any new fields added in prompts.ts
        // are present even if the stored object predates them.
        setSettings({ ...defaultSettings, ...parsed });
      } catch {
        setSettings(defaultSettings);
      }
    }
  }, []);

  function handleSave() {
    localStorage.setItem("twinmind-settings", JSON.stringify(settings));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    setSettings(defaultSettings);
    localStorage.setItem("twinmind-settings", JSON.stringify(defaultSettings));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  return (
    <main className="settings-page">
      <div className="settings-wrap">
        <div className="topbar" style={{ marginBottom: 16 }}>
          <h1>Settings</h1>
          <Link href="/" className="top-btn">← Back to App</Link>
        </div>

        <div className="settings-scroll">
          <SettingsForm settings={settings} setSettings={setSettings} />

          <div className="settings-actions">
            <button onClick={handleSave} className="primary-btn">
              Save Settings
            </button>
            <button onClick={handleReset} className="secondary-btn">
              Reset to Defaults
            </button>
            {saved && (
              <span style={{ color: "#4ade80", fontSize: 13, fontWeight: 600 }}>
                ✓ Saved
              </span>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}