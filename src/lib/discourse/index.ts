import "server-only";
import type { Repo } from "@/lib/db";
import type { DiscourseItem } from "@/lib/types";
import { fixtureDiscourse } from "@/lib/ai/fixtures";
import { buildLiveItems } from "./live";

/**
 * Real-time means real-time: a snapshot older than this is re-pulled on the
 * next request (or by the scheduler), and stale snapshots are pruned on write.
 */
const MAX_SNAPSHOT_AGE_MS =
  Number(process.env.EMBER_SNAPSHOT_TTL_MINUTES ?? 60) * 60 * 1000;

export interface SnapshotResult {
  items: DiscourseItem[];
  /** False when the live pull failed and curated fallback topics were used. */
  live: boolean;
}

/**
 * Session-time discourse context. Live Hacker News pull (keyless), Haiku
 * clustering when an Anthropic key is present. Falls back to the curated
 * perennial-debate set only when the live pull fails — and says so via
 * `live: false`, which the reasoning stream surfaces honestly.
 */
/** Force a fresh pull, ignoring the TTL. Used by the scheduler. */
export async function refreshSnapshot(repo: Repo): Promise<SnapshotResult> {
  const snapshotAt = new Date().toISOString();
  try {
    return { items: await repo.insertSnapshot(await buildLiveItems(snapshotAt)), live: true };
  } catch {
    return { items: await repo.latestSnapshot(), live: false };
  }
}

export async function getOrSeedSnapshot(repo: Repo): Promise<SnapshotResult> {
  const existing = await repo.latestSnapshot();
  const fresh =
    existing.length > 0 &&
    Date.now() - new Date(existing[0].snapshotAt).getTime() <
      MAX_SNAPSHOT_AGE_MS;
  // Trust marker: fixture snapshots carry no HN item links.
  const wasLive = existing.some((i) =>
    i.sources.some((s) => s.url.includes("news.ycombinator.com/item")),
  );

  if (fresh && wasLive) return { items: existing, live: true };

  // Stale, empty, or fallback-quality cache — try to (re)go live.
  const snapshotAt = new Date().toISOString();
  try {
    const items = await repo.insertSnapshot(await buildLiveItems(snapshotAt));
    return { items, live: true };
  } catch {
    if (fresh) return { items: existing, live: false };
    const items = await repo.insertSnapshot(fixtureDiscourse(snapshotAt));
    return { items, live: false };
  }
}
