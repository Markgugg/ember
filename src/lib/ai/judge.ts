import "server-only";
import { z } from "zod";
import { FIXTURE_MODE } from "@/lib/env";
import { cosineSimilarity } from "@/lib/vector";
import type { DiscourseItem, Insight } from "@/lib/types";
import { SONNET, structuredCall } from "./anthropic";
import { JUDGE_SYSTEM } from "./prompts/judge";

export interface CandidatePair {
  insight: Insight;
  item: DiscourseItem;
  /** Embedding prefilter similarity — carried through for scoring. */
  similarity: number;
}

export interface JudgedPair extends CandidatePair {
  intersectionScore: number;
  rationale: string;
}

const judgedSchema = z.object({
  pairs: z.array(
    z.object({
      pairIndex: z.number().int().min(0),
      score: z.number().min(0).max(1),
      rationale: z.string().min(10),
    }),
  ),
});

/** F5 — score candidate insight×discourse pairs. Caller guarantees ≤ 12 pairs. */
export async function judgePairs(pairs: CandidatePair[]): Promise<JudgedPair[]> {
  if (pairs.length === 0) return [];
  if (pairs.length > 12) throw new Error("judgePairs: prefilter must cap at 12 pairs");

  if (FIXTURE_MODE) {
    // Pseudo-embedding cosines run far lower than real ones, so score by
    // rank: the best pair scores high only if it clears an overlap floor —
    // real matches demo well, unrelated content still refuses honestly.
    const sims = pairs.map((p) =>
      cosineSimilarity(p.insight.embedding, p.item.embedding),
    );
    const maxSim = Math.max(...sims);
    const FLOOR = 0.12;
    return pairs.map((p, i) => {
      const relative = maxSim > 0 ? sims[i] / maxSim : 0;
      const intersectionScore =
        maxSim < FLOOR
          ? Math.min(0.45, sims[i] * 2)
          : Math.min(1, 0.5 + relative * 0.35 + p.insight.authority * 0.12);
      return {
        ...p,
        intersectionScore,
        rationale: `You said “${truncate(p.insight.text, 90)}” — today the argument over ${truncate(p.item.title, 70)} is exactly that.`,
      };
    });
  }

  const user = pairs
    .map(
      (p, i) =>
        `PAIR ${i}\nInsight (${p.insight.type}, authority ${p.insight.authority.toFixed(2)}): ${p.insight.text}\nTheir words: "${p.insight.quote}"\nDiscourse: ${p.item.title} — ${p.item.summary}${
          p.item.stanceA ? `\nTension: "${p.item.stanceA}" vs "${p.item.stanceB}"` : ""
        }`,
    )
    .join("\n\n");

  const result = await structuredCall({
    model: SONNET,
    system: JUDGE_SYSTEM,
    user,
    toolName: "score_pairs",
    toolDescription: "Score each candidate insight-discourse pair.",
    inputSchema: {
      type: "object",
      properties: {
        pairs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              pairIndex: { type: "integer" },
              score: { type: "number", minimum: 0, maximum: 1 },
              rationale: { type: "string" },
            },
            required: ["pairIndex", "score", "rationale"],
          },
        },
      },
      required: ["pairs"],
    },
    validator: judgedSchema,
    maxTokens: 1500,
  });

  return result.pairs
    .filter((r) => r.pairIndex < pairs.length)
    .map((r) => ({
      ...pairs[r.pairIndex],
      intersectionScore: r.score,
      rationale: r.rationale,
    }));
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
