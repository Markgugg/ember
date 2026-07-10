import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/identity";
import { runPipeline } from "@/lib/pipeline/run";
import { narrate } from "@/lib/ai/narrate";
import { stripVtt } from "@/lib/ai/transcribe";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z
  .object({
    transcriptText: z.string().max(100_000).optional(),
    source: z.enum(["voice", "paste", "upload"]).optional(),
    transcriptId: z.string().uuid().optional(),
    insightId: z.string().uuid().optional(),
    discourseItemId: z.string().uuid().optional(),
    topicHint: z.string().max(300).optional(),
  })
  .refine(
    (b) =>
      Boolean(b.transcriptText?.trim()) ||
      Boolean(b.transcriptId) ||
      Boolean(b.insightId) ||
      Boolean(b.discourseItemId),
    { message: "need a transcript, an insight, or a story" },
  );

/**
 * F8 — the core loop as SSE. Each event:
 *   data: { stage, line, ...payload }
 * `line` is the display string, composed server-side. The final event is
 * always `done` (with briefId) or `error`.
 */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "invalid request" },
      { status: 400 },
    );
  }
  const userId = await getUserId();
  const {
    transcriptText,
    source,
    transcriptId,
    insightId,
    discourseItemId,
    topicHint,
  } = parsed.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: object) =>
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      try {
        const events = runPipeline({
          userId,
          transcriptText: transcriptText ? stripVtt(transcriptText) : undefined,
          source,
          transcriptId,
          insightId,
          discourseItemId,
          topicHint,
        });
        for await (const event of events) {
          send({ ...event, line: narrate(event) });
        }
      } catch (err) {
        send({
          stage: "error",
          line: narrate({ stage: "error", message: "stream failed" }),
          message: err instanceof Error ? err.message : "stream failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
