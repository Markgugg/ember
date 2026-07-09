/**
 * Composite ranking — pure functions, the unit-test home.
 * PostScore = intersection × authority-weight × velocity-weight × differentiation.
 */
import { cosineSimilarity } from "@/lib/vector";
import type { DiscourseItem, Insight } from "@/lib/types";

/** A judged pair must clear this to produce a post. Below it, ember refuses. */
export const REFUSAL_THRESHOLD = 0.6;

/** Max candidate pairs sent to the judge — the prefilter's hard cap. */
export const JUDGE_CAP = 12;

export interface ScoreInput {
  intersectionScore: number;
  authority: number;
  velocity: number;
  /** Max cosine vs the user's already-posted insights (0 when none). */
  differentiation: number;
}

export function compositeScore(s: ScoreInput): number {
  const authorityWeight = 0.5 + 0.5 * clamp01(s.authority);
  const velocityWeight = 0.7 + 0.3 * clamp01(s.velocity);
  const differentiationWeight = 1 - 0.6 * clamp01(s.differentiation);
  return (
    clamp01(s.intersectionScore) *
    authorityWeight *
    velocityWeight *
    differentiationWeight
  );
}

/** Max similarity against already-posted content — the anti-repetition guard. */
export function differentiationPenalty(
  embedding: number[],
  postedEmbeddings: number[][],
): number {
  let max = 0;
  for (const posted of postedEmbeddings) {
    const sim = cosineSimilarity(embedding, posted);
    if (sim > max) max = sim;
  }
  return max;
}

export interface PrefilterPair {
  insight: Insight;
  item: DiscourseItem;
  similarity: number;
}

/**
 * Embedding prefilter: every insight × item pair above `floor`, best-first,
 * capped at JUDGE_CAP. The floor is mode-dependent (real embeddings ~0.35+,
 * pseudo-embeddings much lower) so the caller supplies it.
 */
export function prefilterPairs(
  insights: Insight[],
  items: DiscourseItem[],
  floor: number,
): PrefilterPair[] {
  const pairs: PrefilterPair[] = [];
  for (const insight of insights) {
    for (const item of items) {
      const similarity = cosineSimilarity(insight.embedding, item.embedding);
      if (similarity >= floor) pairs.push({ insight, item, similarity });
    }
  }
  return pairs.sort((a, b) => b.similarity - a.similarity).slice(0, JUDGE_CAP);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
