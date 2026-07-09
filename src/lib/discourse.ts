import "server-only";
import type { Repo } from "@/lib/db";
import type { DiscourseItem } from "@/lib/types";
import { fixtureDiscourse } from "@/lib/ai/fixtures";

const MAX_SNAPSHOT_AGE_MS = 48 * 60 * 60 * 1000;

/**
 * Lazy discourse context — no cron, no scraper (deferred by design).
 * The session pulls the latest stored snapshot; if none exists or it has
 * aged out, it seeds one on demand. Today the seed is the curated fixture
 * set; swapping in a live HN/RSS pull later only changes `seedItems()`.
 */
export async function getOrSeedSnapshot(repo: Repo): Promise<DiscourseItem[]> {
  const existing = await repo.latestSnapshot();
  if (existing.length > 0) {
    const age = Date.now() - new Date(existing[0].snapshotAt).getTime();
    if (age < MAX_SNAPSHOT_AGE_MS) return existing;
  }
  return repo.insertSnapshot(seedItems());
}

function seedItems(): Omit<DiscourseItem, "id">[] {
  return fixtureDiscourse(new Date().toISOString());
}
