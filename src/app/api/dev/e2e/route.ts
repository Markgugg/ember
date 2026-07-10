import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { getUserId } from "@/lib/identity";
import { runPipeline } from "@/lib/pipeline/run";
import { findStyleViolations } from "@/lib/ai/style";
import { findBannedPhrases } from "@/lib/ai/banned";

/**
 * Dev-only end-to-end run: transcript in, brief out, with the drafts checked
 * against the style rules they're supposed to obey. 404s in production.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("not found", { status: 404 });
  }
  const body = (await req.json()) as { text?: string; storyId?: string };
  if (!body.text?.trim()) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  const userId = await getUserId();
  const stages: string[] = [];
  let briefId: string | null = null;

  for await (const ev of runPipeline({
    userId,
    transcriptText: body.text,
    source: "paste",
    discourseItemId: body.storyId,
  })) {
    stages.push(ev.stage);
    if (ev.stage === "done") briefId = ev.briefId;
    if (ev.stage === "error") {
      return NextResponse.json({ stages, error: ev.message }, { status: 500 });
    }
  }

  const repo = await getRepo();
  const bundle = briefId ? await repo.getBriefBundle(briefId, userId) : null;

  return NextResponse.json({
    stages,
    refused: Boolean(bundle?.brief.refusal),
    refusal: bundle?.brief.refusal ?? null,
    intersectionScore: bundle?.brief.intersectionScore ?? null,
    story: bundle?.discourseItem?.title ?? null,
    drafts:
      bundle?.drafts.map((d) => ({
        angle: d.angle,
        isPrimary: d.isPrimary,
        styleViolations: findStyleViolations(d.body),
        bannedPhrases: findBannedPhrases(d.body),
        hasEmDash: /[—–]/.test(d.body),
        hasSemicolon: /;/.test(d.body),
        body: d.body,
      })) ?? [],
  });
}
