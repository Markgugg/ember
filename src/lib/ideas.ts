import "server-only";
import { getRepo } from "@/lib/db";
import { getOrSeedSnapshot } from "@/lib/discourse";
import { prefilterPairs } from "@/lib/pipeline/score";
import { FIXTURE_MODE } from "@/lib/env";
import type { DiscourseItem, Insight } from "@/lib/types";

export interface PostIdea {
  insight: Insight;
  item: DiscourseItem;
  similarity: number;
}

export interface DashboardData {
  ideas: PostIdea[];
  discourse: DiscourseItem[];
  live: boolean;
  stats: {
    insightsBanked: number;
    postsDrafted: number;
    postsShipped: number;
    snapshotAgeHours: number | null;
  };
}

const IDEA_FLOOR = FIXTURE_MODE ? 0.04 : 0.3;

/**
 * Dashboard intelligence — cheap by design. Ideas are vault × live-discourse
 * matches from the embedding prefilter only (no LLM call); the full judge
 * runs when the user actually clicks "Generate post".
 */
export async function getDashboardData(userId: string): Promise<DashboardData> {
  const repo = await getRepo();
  const [insights, snapshot, bundles] = await Promise.all([
    repo.listInsights(userId),
    getOrSeedSnapshot(repo),
    repo.listBriefBundles(userId),
  ]);

  const vaulted = insights.filter((i) => i.status !== "posted");
  const pairs = prefilterPairs(vaulted, snapshot.items, IDEA_FLOOR);

  // one idea per insight, strongest match first
  const seen = new Set<string>();
  const ideas: PostIdea[] = [];
  for (const p of pairs) {
    if (seen.has(p.insight.id)) continue;
    seen.add(p.insight.id);
    ideas.push(p);
    if (ideas.length === 3) break;
  }

  const drafts = bundles.flatMap((b) => b.drafts);
  return {
    ideas,
    discourse: [...snapshot.items].sort((a, b) => b.velocity - a.velocity),
    live: snapshot.live,
    stats: {
      insightsBanked: insights.length,
      postsDrafted: bundles.filter((b) => b.brief.status !== "refused").length,
      postsShipped: drafts.filter((d) => d.status === "posted").length,
      snapshotAgeHours:
        snapshot.items.length > 0
          ? (Date.now() - new Date(snapshot.items[0].snapshotAt).getTime()) /
            3_600_000
          : null,
    },
  };
}
