import "server-only";
import { FIXTURE_MODE } from "@/lib/env";
import { getRepo } from "@/lib/db";
import type { Insight, TranscriptSource } from "@/lib/types";
import { embed } from "@/lib/ai/embeddings";
import { mineInsights } from "@/lib/ai/mine";
import { judgePairs } from "@/lib/ai/judge";
import { generateDrafts } from "@/lib/ai/draft";
import type { StageEvent } from "@/lib/ai/narrate";
import { getOrSeedSnapshot } from "@/lib/discourse";
import {
  compositeScore,
  differentiationPenalty,
  prefilterPairs,
  REFUSAL_THRESHOLD,
} from "./score";

/** Insight-level dedupe threshold (F3). */
const DEDUPE_THRESHOLD = 0.92;
/** Embedding prefilter floor — mode-dependent (see score.ts). */
const PREFILTER_FLOOR = FIXTURE_MODE ? 0.05 : 0.35;

export interface PipelineInput {
  userId: string;
  /** Fresh thinking (session path) … */
  transcriptText?: string;
  source?: TranscriptSource;
  /** … or an existing vaulted insight (library path). */
  insightId?: string;
  /** Bias intersection toward this topic (refusal redirect). */
  topicHint?: string;
}

/**
 * The core loop: transcript → insights → discourse → intersection → drafts.
 * Yields StageEvents as each step truly completes (F8: no timed fakes).
 * Always ends with `done` (carrying the brief id — post or refusal) or `error`.
 */
export async function* runPipeline(
  input: PipelineInput,
): AsyncGenerator<StageEvent> {
  const repo = await getRepo();
  try {
    yield { stage: "reading" };

    /* ── 1. insights ────────────────────────────────────────────── */
    let sessionInsights: Insight[] = [];

    if (input.insightId) {
      const existing = await repo.getInsight(input.insightId, input.userId);
      if (!existing) throw new Error("insight not found");
      sessionInsights = [existing];
      yield {
        stage: "insights_found",
        count: 1,
        strongest: existing.text,
      };
    } else if (input.transcriptText) {
      const transcript = await repo.insertTranscript({
        userId: input.userId,
        source: input.source ?? "paste",
        rawText: input.transcriptText,
        wordCount: input.transcriptText.split(/\s+/).length,
      });

      const mined = await mineInsights(input.transcriptText);
      for (const m of mined) {
        const embedding = await embed(`${m.text} ${m.quote}`);
        const similar = await repo.findSimilarInsight(
          input.userId,
          embedding,
          DEDUPE_THRESHOLD,
        );
        if (similar) {
          await repo.touchInsightRecurrence(similar.id, input.userId);
          sessionInsights.push(similar);
        } else {
          sessionInsights.push(
            await repo.insertInsight({
              userId: input.userId,
              transcriptId: transcript.id,
              text: m.text,
              quote: m.quote,
              type: m.type,
              authority: m.authority,
              charge: m.charge,
              embedding,
            }),
          );
        }
      }

      if (sessionInsights.length === 0) {
        yield { stage: "no_insights" };
        const brief = await insertRefusal(repo, input.userId, null, null);
        yield { stage: "done", briefId: brief.id };
        return;
      }
      const strongest = [...sessionInsights].sort(
        (a, b) => b.authority + b.charge - (a.authority + a.charge),
      )[0];
      yield {
        stage: "insights_found",
        count: sessionInsights.length,
        strongest: strongest.text,
      };
    } else {
      throw new Error("pipeline needs transcriptText or insightId");
    }

    /* ── 2. discourse ───────────────────────────────────────────── */
    yield { stage: "checking_discourse" };
    let items = [] as Awaited<ReturnType<typeof getOrSeedSnapshot>>;
    try {
      items = await getOrSeedSnapshot(repo);
    } catch {
      yield { stage: "discourse_degraded" };
    }

    if (input.topicHint && items.length > 0) {
      const hint = input.topicHint.toLowerCase();
      const hinted = items.filter(
        (i) =>
          i.title.toLowerCase().includes(hint) ||
          i.summary.toLowerCase().includes(hint),
      );
      if (hinted.length > 0) items = hinted;
    }

    /* ── 3. intersection ────────────────────────────────────────── */
    const posted = (await repo.listInsights(input.userId)).filter(
      (i) => i.status === "posted",
    );
    const postedEmbeddings = posted.map((p) => p.embedding);

    const candidates = prefilterPairs(sessionInsights, items, PREFILTER_FLOOR);
    const judged = candidates.length > 0 ? await judgePairs(candidates) : [];

    const ranked = judged
      .map((j) => ({
        ...j,
        composite: compositeScore({
          intersectionScore: j.intersectionScore,
          authority: j.insight.authority,
          velocity: j.item.velocity,
          differentiation: differentiationPenalty(
            j.insight.embedding,
            postedEmbeddings,
          ),
        }),
      }))
      .sort((a, b) => b.composite - a.composite);

    const winner = ranked.find((r) => r.intersectionScore >= REFUSAL_THRESHOLD);

    /* ── 4a. degraded: insights but no discourse at all ─────────── */
    if (!winner && items.length === 0) {
      const best = [...sessionInsights].sort(
        (a, b) => b.authority + b.charge - (a.authority + a.charge),
      )[0];
      yield { stage: "no_intersection" };
      yield { stage: "drafting" };
      const briefId = await draftAndPersist(repo, input.userId, best, null, {
        rationale:
          "No live discourse reachable — this stands on your words alone.",
        score: null,
      });
      yield { stage: "done", briefId };
      return;
    }

    /* ── 4b. refusal: discourse present, nothing clears the bar ─── */
    if (!winner) {
      const closest = ranked[0] ?? null;
      const brief = await insertRefusal(
        repo,
        input.userId,
        closest
          ? {
              missText: closest.insight.text,
              reason: `it's fine, but it doesn't meet today's conversation anywhere — the closest thread (${closest.item.title}) only brushes it.`,
            }
          : {
              missText: sessionInsights[0].text,
              reason:
                "nothing the world is arguing about today gives it a reason to exist right now.",
            },
        items.length > 0
          ? [...items].sort((a, b) => b.velocity - a.velocity)[0]
          : null,
      );
      yield { stage: "no_intersection" };
      yield { stage: "done", briefId: brief.id };
      return;
    }

    /* ── 5. drafts ──────────────────────────────────────────────── */
    yield {
      stage: "intersection_found",
      title: winner.item.title,
      meta: winner.item.sources[0]?.meta ?? winner.item.sources[0]?.domain ?? "live",
    };
    yield { stage: "drafting" };

    const briefId = await draftAndPersist(
      repo,
      input.userId,
      winner.insight,
      winner.item,
      { rationale: winner.rationale, score: winner.intersectionScore },
    );
    yield { stage: "done", briefId };
  } catch (err) {
    yield {
      stage: "error",
      message: err instanceof Error ? err.message : "pipeline failed",
    };
  }
}

/* ── helpers ──────────────────────────────────────────────────────── */

async function draftAndPersist(
  repo: Awaited<ReturnType<typeof getRepo>>,
  userId: string,
  insight: Insight,
  item: Awaited<ReturnType<typeof getOrSeedSnapshot>>[number] | null,
  intersection: { rationale: string; score: number | null },
): Promise<string> {
  const profile = await repo.getProfile(userId);
  const set = await generateDrafts({
    insight,
    item,
    voiceSamples: profile?.voiceSamples ?? [],
    audience: profile?.audience ?? null,
  });

  const brief = await repo.insertBrief({
    userId,
    insightId: insight.id,
    discourseItemId: item?.id ?? null,
    intersectionScore: intersection.score,
    intersectionRationale: intersection.rationale,
    recommendation: set.recommendation,
    refusal: null,
    origin: "session",
  });

  await repo.insertDrafts(
    set.drafts.map((d, i) => ({
      briefId: brief.id,
      angle: d.angle,
      rationale: d.rationale,
      body: d.body,
      isPrimary: i === set.primaryIndex,
    })),
  );
  await repo.updateInsightStatus(insight.id, userId, "drafted");
  return brief.id;
}

async function insertRefusal(
  repo: Awaited<ReturnType<typeof getRepo>>,
  userId: string,
  miss: { missText: string; reason: string } | null,
  redirectItem: { title: string } | null,
) {
  return repo.insertBrief({
    userId,
    insightId: null,
    discourseItemId: null,
    intersectionScore: null,
    intersectionRationale: null,
    recommendation: null,
    refusal: {
      closestMiss: miss?.missText ?? "",
      reason:
        miss?.reason ??
        "nothing in this one is a claim yet — it reads as notes, not a take.",
      redirectTopic: redirectItem?.title ?? "",
      redirectLine: redirectItem
        ? `But everyone's arguing about “${redirectItem.title}” — your lane. Got a take? Talk for two minutes.`
        : "Try again with the strongest opinion you've had this week.",
    },
    origin: "session",
    status: "refused",
  });
}
