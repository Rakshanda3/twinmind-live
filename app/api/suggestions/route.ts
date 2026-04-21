import { NextRequest, NextResponse } from "next/server";
import { groqChatCompletion } from "@/lib/groq";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      apiKey,
      prompt,
      transcript,
    }: {
      apiKey: string;
      prompt: string;
      transcript: string;
      priorSuggestions?: string[];
    } = body;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing Groq API key" }, { status: 400 });
    }

    if (!transcript?.trim()) {
      return NextResponse.json({ suggestions: [] });
    }

    // No dedup — sending prior suggestions as "do not repeat" causes the model
    // to output invalid JSON when it can't generate sufficiently different
    // suggestions for the same transcript window. The transcript naturally
    // changes every 30s, providing enough variety between batches.
    const userPrompt = `Meeting transcript:\n${transcript}\n\nOutput a JSON object with a "suggestions" array. Nothing else — no explanation, no markdown, no text outside the JSON.`;

    const result = await groqChatCompletion({
      apiKey,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 500,
    });

    const raw: string = result?.choices?.[0]?.message?.content ?? "";

    console.log("\n=== SUGGESTIONS RAW ===\n" + raw + "\n=======================\n");

    const extractJSON = (text: string) => {
      const stripped = text
        .replace(/^```(?:json)?\s*/im, "")
        .replace(/```\s*$/im, "")
        .trim();
      try {
        return JSON.parse(stripped);
      } catch {
        const start = stripped.indexOf("{");
        const end = stripped.lastIndexOf("}");
        if (start !== -1 && end !== -1 && end > start) {
          try {
            return JSON.parse(stripped.slice(start, end + 1));
          } catch {
            return null;
          }
        }
        return null;
      }
    };

    let parsed: { suggestions?: Array<{ type: string; preview: string }> } = { suggestions: [] };
    const extracted = extractJSON(raw);
    if (extracted) parsed = extracted;

    const VALID_TYPES = new Set(["answer", "fact_check", "clarification", "talking_point", "question"]);

    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .filter(
            (s) =>
              s &&
              typeof s.type === "string" &&
              VALID_TYPES.has(s.type) &&
              typeof s.preview === "string" &&
              s.preview.trim().length > 15 &&
              !s.preview.includes("your text here") &&
              !s.preview.includes("write the actual") &&
              !s.preview.includes("describe what specific") &&
              !s.preview.includes("name the specific")
          )
          .slice(0, 3)
      : [];

    console.log(`=== PARSED: ${suggestions.length} valid suggestions ===\n`);

    return NextResponse.json({ suggestions, _raw: raw });
  } catch (error) {
    console.error("Suggestions route error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Suggestion generation failed" },
      { status: 500 }
    );
  }
}