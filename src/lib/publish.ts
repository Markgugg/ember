import "server-only";
import { getRepo } from "@/lib/db";
import { linkedinReady, postToLinkedIn, type PostLink } from "@/lib/linkedin";
import { sanitizePunctuation } from "@/lib/ai/style";
import type { Repo } from "@/lib/db";
import type { DiscourseItem } from "@/lib/types";

export type PublishResult =
  | { ok: true; postId: string }
  | { ok: false; error: string };

/**
 * The link a post should carry. Prefer the article being discussed, since it's
 * the thing with a preview image and the thing the reader wants. Fall back to
 * the discussion thread when the story was a self-post with no outbound link.
 * Returns null when the post was written from a transcript alone, because
 * there is then nothing honest to link to.
 */
export function sourceLink(item: DiscourseItem | null): PostLink | null {
  const source = item?.sources?.[0];
  if (!source) return null;
  const url = source.articleUrl ?? source.url;
  if (!url) return null;
  // The card headline is as visible as the post, so it obeys the same rules.
  return { url, title: item ? sanitizePunctuation(item.title) : null };
}

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

  // Loaded before posting: a post written against a story carries that story's
  // link, which is what gives the post its preview card.
  const bundle = await repo.getBriefBundle(draft.briefId, userId);

  try {
    const postId = await postToLinkedIn(
      profile!,
      draft.body,
      sourceLink(bundle?.discourseItem ?? null),
    );
    await repo.updateDraft(draftId, userId, { status: "posted" });
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
