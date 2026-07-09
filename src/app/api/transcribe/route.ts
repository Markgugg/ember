import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/ai/transcribe";

export const runtime = "nodejs";
export const maxDuration = 60;

/** F2 — audio in, transcript out. Audio is never stored. */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No audio file provided." }, { status: 400 });
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Recording too large (25MB max)." },
      { status: 413 },
    );
  }

  const result = await transcribeAudio(file);
  if ("error" in result) {
    // 501: capability honestly unavailable (no key) — UI falls back to paste.
    return NextResponse.json(result, { status: 501 });
  }
  return NextResponse.json(result);
}
