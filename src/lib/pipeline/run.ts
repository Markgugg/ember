import "server-only";
import { LOCAL_EMBEDDINGS } from "@/lib/env";
import { getRepo } from "@/lib/db";
import type { DiscourseItem, Insight, TranscriptSource } from "@/lib/types";
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
  PINNED_REFUSAL_THRESHOLD,
  REFUSAL_THRESHOLD,
} from "./score";

/** Insight-level dedupe threshold (F3). */
const DEDUPE_THRESHOLD = 0.92;
/** Embedding prefilter floor — local vectors run far cooler than OpenAI's. */
const PREFILTER_FLOOR = LOCAL_EMBEDDINGS ? 0.05 : 0.35;

export interface PipelineInput {
  userId: string;
  /** Fresh thinking (paste/record/upload) … */
  transcriptText?: string;
  source?: TranscriptSource;
  /** … or a conversation already in the library ("From a transcript") … */
  transcriptId?: string;
  /** … or one vaulted claim (an angle chip). */
  insightId?: string;
  /**
   * Pin the story ("From the news" / "Blend both"). The intersection is
   * restricted to this item — and if nothing you've said meets it, Current
   * refuses rather than inventing an opinion for you.
   */
  discourseItemId?: string;
  /** Soft bias toward a topic (refusal redirect). */
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
    } else if (input.discourseItemId && !input.transcriptText && !input.transcriptId) {
      // "From the news": the story is pinned, so the claim must come from
      // everything you've ever said. No vault, no post — that's the rule.
      sessionInsights = (await repo.listInsights(input.userId)).filter(
        (i) => i.status !== "posted",
      );
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
    } else if (input.transcriptId) {
      // "From a transcript": a conversation already in the library.
      const stored = await repo.getTranscript(input.transcriptId, input.userId);
      if (!stored) throw new Error("transcript not found");
      sessionInsights = await repo.listInsightsByTranscript(
        stored.id,
        input.userId,
      );
      if (sessionInsights.length === 0) {
        sessionInsights = await mineAndBank(
          repo,
          input.userId,
          stored.id,
          stored.rawText,
        );
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
    } else if (input.transcriptText) {
      const transcript = await repo.insertTranscript({
        userId: input.userId,
        source: input.source ?? "paste",
        rawText: input.transcriptText,
        wordCount: input.transcriptText.split(/\s+/).length,
      });

      sessionInsights = await mineAndBank(
        repo,
        input.userId,
        transcript.id,
        input.transcriptText,
      );

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
      throw new Error("pipeline needs transcriptText, transcriptId, insightId, or discourseItemId");
    }

    /* ── 2. discourse ───────────────────────────────────────────── */
    yield { stage: "checking_discourse" };
    let items: DiscourseItem[] = [];
    try {
      const snapshot = await getOrSeedSnapshot(repo);
      items = snapshot.items;
      if (!snapshot.live) yield { stage: "discourse_fallback" };
    } catch {
      yield { stage: "discourse_degraded" };
    }

    if (input.discourseItemId) {
      // Pinned story wins over everything: this and only this conversation.
      const pinned =
        items.find((i) => i.id === input.discourseItemId) ??
        (await repo.getDiscourseItem(input.discourseItemId));
      items = pinned ? [pinned] : [];
    } else if (input.topicHint && items.length > 0) {
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

    // When the user pinned a story, let the judge see every claim they hold —
    // the judge is the stingy one, and it still refuses weak matches.
    const floor = input.discourseItemId ? 0 : PREFILTER_FLOOR;
    const candidates = prefilterPairs(sessionInsights, items, floor);
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

    const bar = input.discourseItemId
      ? PINNED_REFUSAL_THRESHOLD
      : REFUSAL_THRESHOLD;
    const winner = ranked.find((r) => r.intersectionScore >= bar);

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

/** Mine a stored transcript into banked insights (dedupe-aware). */
async function mineAndBank(
  repo: Awaited<ReturnType<typeof getRepo>>,
  userId: string,
  transcriptId: string,
  rawText: string,
): Promise<Insight[]> {
  const mined = await mineInsights(rawText);
  const out: Insight[] = [];
  for (const m of mined) {
    const embedding = await embed(`${m.text} ${m.quote}`);
    const similar = await repo.findSimilarInsight(
      userId,
      embedding,
      DEDUPE_THRESHOLD,
    );
    if (similar) {
      await repo.touchInsightRecurrence(similar.id, userId);
      out.push(similar);
    } else {
      out.push(
        await repo.insertInsight({
          userId,
          transcriptId,
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
  return out;
}

async function draftAndPersist(
  repo: Awaited<ReturnType<typeof getRepo>>,
  userId: string,
  insight: Insight,
  item: DiscourseItem | null,
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
