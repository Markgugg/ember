import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { getUserId } from "@/lib/identity";
import { mineInsights } from "@/lib/ai/mine";
import { judgePairs } from "@/lib/ai/judge";
import { embed } from "@/lib/ai/embeddings";
import { getOrSeedSnapshot } from "@/lib/discourse";
import { prefilterPairs, REFUSAL_THRESHOLD } from "@/lib/pipeline/score";
import { cosineSimilarity } from "@/lib/vector";
import { FIXTURE_MODE, LOCAL_EMBEDDINGS } from "@/lib/env";
import type { Insight } from "@/lib/types";

/**
 * Dev-only X-ray of the intersection step: what got mined, what the
 * embedding prefilter kept, and exactly what the judge scored. 404s in prod.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("not found", { status: 404 });
  }
  const body = (await req.json()) as { text?: string; floor?: number };
  const text = body.text?.trim();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const repo = await getRepo();
  const userId = await getUserId();

  const mined = await mineInsights(text);
  const insights: Insight[] = [];
  for (const m of mined) {
    insights.push({
      id: `tmp-${insights.length}`,
      userId,
      transcriptId: "tmp",
      text: m.text,
      quote: m.quote,
      type: m.type,
      authority: m.authority,
      charge: m.charge,
      embedding: await embed(`${m.text} ${m.quote}`),
      status: "vaulted",
      recurrence: 1,
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
  }

  const snapshot = await getOrSeedSnapshot(repo);
  const floor = body.floor ?? (LOCAL_EMBEDDINGS ? 0.05 : 0.35);

  const allSims = insights.flatMap((i) =>
    snapshot.items.map((it) => ({
      insight: i.text.slice(0, 70),
      item: it.title.slice(0, 70),
      cosine: Number(cosineSimilarity(i.embedding, it.embedding).toFixed(3)),
    })),
  );

  const candidates = prefilterPairs(insights, snapshot.items, floor);
  const judged = candidates.length > 0 ? await judgePairs(candidates) : [];

  return NextResponse.json({
    mode: { FIXTURE_MODE, LOCAL_EMBEDDINGS, floor, REFUSAL_THRESHOLD },
    minedCount: mined.length,
    mined: mined.map((m) => ({
      text: m.text,
      type: m.type,
      authority: m.authority,
      charge: m.charge,
    })),
    itemCount: snapshot.items.length,
    live: snapshot.live,
    topCosines: allSims.sort((a, b) => b.cosine - a.cosine).slice(0, 8),
    candidateCount: candidates.length,
    judged: judged
      .map((j) => ({
        score: j.intersectionScore,
        clears: j.intersectionScore >= REFUSAL_THRESHOLD,
        insight: j.insight.text.slice(0, 70),
        item: j.item.title.slice(0, 70),
      }))
      .sort((a, b) => b.score - a.score),
    wouldRefuse: !judged.some((j) => j.intersectionScore >= REFUSAL_THRESHOLD),
  });
}
