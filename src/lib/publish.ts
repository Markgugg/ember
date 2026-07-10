import "server-only";
import { getRepo } from "@/lib/db";
import { linkedinReady, postToLinkedIn } from "@/lib/linkedin";
import type { Repo } from "@/lib/db";

export type PublishResult =
  | { ok: true; postId: string }
  | { ok: false; error: string };

/**
 * Publish one draft to the owner's LinkedIn and mark everything that follows
 * from it (draft posted, insight posted, brief consumed). Shared by "Post
 * now" and the due-slot publisher.
 */
export async function publishDraft(
  repo: Repo,
  userId: string,
  draftId: string,
): Promise<PublishResult> {
  const draft = await repo.getDraft(draftId, userId);
  if (!draft) return { ok: false, error: "draft not found" };
  if (draft.status === "posted") return { ok: false, error: "already posted" };

  const profile = await repo.getProfile(userId);
  if (!linkedinReady(profile)) {
    return {
      ok: false,
      error:
        "LinkedIn isn't connected (or the token expired). Connect it from the Queue page.",
    };
  }

  try {
    const postId = await postToLinkedIn(profile!, draft.body);
    await repo.updateDraft(draftId, userId, { status: "posted" });
    const bundle = await repo.getBriefBundle(draft.briefId, userId);
    if (bundle?.brief.insightId) {
      await repo.updateInsightStatus(bundle.brief.insightId, userId, "posted");
      await repo.updateBriefStatus(draft.briefId, userId, "consumed");
    }
    return { ok: true, postId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "post failed",
    };
  }
}

/** Publish every due planned draft (all users). Used by the cron route. */
export async function publishDue(): Promise<{
  published: number;
  skipped: number;
  errors: string[];
}> {
  const repo = await getRepo();
  const due = await repo.listDueDrafts(new Date().toISOString());
  let published = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const { draft, userId } of due) {
    const result = await publishDraft(repo, userId, draft.id);
    if (result.ok) {
      published++;
    } else if (result.error.includes("connected")) {
      // Not connected: leave the slot; it's a reminder, exactly as promised.
      skipped++;
    } else {
      errors.push(`${draft.id}: ${result.error}`);
    }
  }
  return { published, skipped, errors };
}
