import "server-only";
import { getRepo } from "@/lib/db";
import { linkedinReady, postToLinkedIn, type PostLink } from "@/lib/linkedin";
import { sanitizePunctuation } from "@/lib/ai/style";
import type { Repo } from "@/lib/db";
import type { DiscourseItem, Profile } from "@/lib/types";

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
/**
 * Fetch the article's own Open Graph image and upload it as a LinkedIn asset.
 *
 * LinkedIn would normally build the card itself, but its crawler is 403'd by
 * Cloudflare-fronted publishers, which is why posts came out as a bare
 * title-and-domain box. We can read the page (we present as a browser), so we
 * hand LinkedIn the publisher's own artwork rather than inventing one.
 *
 * Returns null on any failure. The caller falls back to the plain card: a post
 * without a picture is a smaller loss than a post that never went out.
 */
async function attachArticleImage(
  profile: Profile,
  articleUrl: string,
): Promise<string | null> {
  try {
    const { fetchArticlePreview, fetchImageBytes } = await import("@/lib/preview");
    const preview = await fetchArticlePreview(articleUrl);
    if (!preview.fetched || !preview.image) return null;

    const image = await fetchImageBytes(preview.image);
    if (!image) return null;

    const { uploadImage } = await import("@/lib/linkedin");
    return await uploadImage(profile, image.bytes, image.contentType);
  } catch {
    return null;
  }
}

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
  // link and, when we can get it, that story's own image.
  const bundle = await repo.getBriefBundle(draft.briefId, userId);
  const link = sourceLink(bundle?.discourseItem ?? null);

  // Imagery is an enhancement and must never be able to stop a post going out.
  // Any failure here degrades to the ARTICLE card, then to plain text.
  const imageAsset = link ? await attachArticleImage(profile!, link.url) : null;

  // With an image in the media slot, LinkedIn renders no link card, so the
  // URL has to live in the body or the source becomes unreachable.
  const body = imageAsset && link ? `${draft.body}\n\nvia ${link.url}` : draft.body;

  try {
    const postId = await postToLinkedIn(profile!, body, link, imageAsset);
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
