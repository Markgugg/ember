import "server-only";
import OpenAI from "openai";
import { serverEnv } from "@/lib/env";

/**
 * F2 — Whisper transcription. Needs only the OpenAI key (independent of
 * full fixture mode). When the key is absent we say so honestly — the UI
 * falls back to paste; we never fake a transcription.
 */
export const transcriptionAvailable = () => Boolean(serverEnv.openaiApiKey);

export async function transcribeAudio(
  file: File,
): Promise<{ text: string } | { error: string }> {
  if (!serverEnv.openaiApiKey) {
    return {
      error:
        "Transcription needs an OpenAI API key — paste your thinking instead, or add OPENAI_API_KEY.",
    };
  }
  const openai = new OpenAI({ apiKey: serverEnv.openaiApiKey });
  const result = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
  });
  return { text: result.text };
}

/** Strip WebVTT/SRT furniture so uploads enter the pipeline as plain thought. */
export function stripVtt(raw: string): string {
  return raw
    .replace(/^WEBVTT.*$/m, "")
    .replace(/^\d+$/gm, "")
    .replace(/^\d{2}:\d{2}(:\d{2})?[.,]\d{3}\s+-->.*$/gm, "")
    .replace(/<[^>]+>/g, "")
    .replace(/^\s*\[[^\]]*\]\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
