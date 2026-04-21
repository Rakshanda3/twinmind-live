import { NextRequest, NextResponse } from "next/server";
import { groqTranscription } from "@/lib/groq";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const apiKey = String(formData.get("apiKey") || "");
    const audio = formData.get("audio");

    if (!apiKey) {
      return NextResponse.json({ error: "Missing Groq API key" }, { status: 400 });
    }

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
    }

    const result = await groqTranscription({ apiKey, file: audio });

    return NextResponse.json({ text: result.text || "" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transcription failed" },
      { status: 500 }
    );
  }
}