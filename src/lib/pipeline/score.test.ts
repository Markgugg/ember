import { describe, expect, it } from "vitest";
import {
  compositeScore,
  differentiationPenalty,
  JUDGE_CAP,
  prefilterPairs,
} from "./score";
import { pseudoEmbedding } from "@/lib/ai/fixtures";
import type { DiscourseItem, Insight } from "@/lib/types";

const insight = (text: string, over: Partial<Insight> = {}): Insight => ({
  id: text,
  userId: "u",
  transcriptId: "t",
  text,
  quote: text,
  type: "opinion",
  authority: 0.5,
  charge: 0.5,
  recurrence: 1,
  status: "vaulted",
  embedding: pseudoEmbedding(text),
  lastSeenAt: "",
  createdAt: "",
  ...over,
});

const item = (title: string): DiscourseItem => ({
  id: title,
  snapshotAt: "",
  title,
  summary: title,
  stanceA: null,
  stanceB: null,
  velocity: 0.5,
  sources: [],
  embedding: pseudoEmbedding(`${title} ${title}`),
});

describe("compositeScore", () => {
  it("ranks higher authority above lower, all else equal", () => {
    const base = { intersectionScore: 0.8, velocity: 0.5, differentiation: 0 };
    expect(compositeScore({ ...base, authority: 0.9 })).toBeGreaterThan(
      compositeScore({ ...base, authority: 0.2 }),
    );
  });

  it("penalizes repetition: an insight matching posted content ranks below a fresh equal", () => {
    const base = { intersectionScore: 0.8, authority: 0.5, velocity: 0.5 };
    expect(compositeScore({ ...base, differentiation: 0.9 })).toBeLessThan(
      compositeScore({ ...base, differentiation: 0 }),
    );
  });

  it("clamps out-of-range inputs instead of exploding the score", () => {
    const score = compositeScore({
      intersectionScore: 1.7,
      authority: 2,
      velocity: -1,
      differentiation: -5,
    });
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe("differentiationPenalty", () => {
  it("is 0 with no posted content", () => {
    expect(differentiationPenalty(pseudoEmbedding("agents"), [])).toBe(0);
  });

  it("approaches 1 for near-identical posted content", () => {
    const e = pseudoEmbedding("agents fail at handoff not reasoning");
    expect(differentiationPenalty(e, [e])).toBeCloseTo(1, 5);
  });
});

describe("prefilterPairs", () => {
  it("hard-caps the judge fan-out at JUDGE_CAP pairs", () => {
    const insights = Array.from({ length: 6 }, (_, i) =>
      insight(`agents handoff state context pipeline ${i}`),
    );
    const items = Array.from({ length: 8 }, (_, i) =>
      item(`agents handoff state context production ${i}`),
    );
    const pairs = prefilterPairs(insights, items, 0);
    expect(pairs.length).toBeLessThanOrEqual(JUDGE_CAP);
  });

  it("drops pairs below the floor and sorts best-first", () => {
    const related = insight("agent handoff drops context between steps");
    const unrelated = insight("my sourdough starter needs more rye flour");
    const target = item("agent handoff context loss in production pipelines");
    const pairs = prefilterPairs([related, unrelated], [target], 0.15);
    expect(pairs.some((p) => p.insight.id === related.id)).toBe(true);
    expect(pairs.some((p) => p.insight.id === unrelated.id)).toBe(false);
    for (let i = 1; i < pairs.length; i++) {
      expect(pairs[i - 1].similarity).toBeGreaterThanOrEqual(pairs[i].similarity);
    }
  });
});
