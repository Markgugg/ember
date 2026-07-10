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
 * Fill in the card LinkedIn will render: the article's own image, headline and
 * blurb, read from its Open Graph tags.
 *
 * We supply these rather than letting LinkedIn crawl for them. Its crawler is
 * 403'd by openai.com, and even anthropic.com — which serves og:image happily
 * to everyone else — came back as an imageless card. Supplying the thumbnail
 * makes the picture our decision instead of a coin flip.
 *
 * Best effort. A link with no image still posts as a plain card, and a failure
 * here never stops the post going out.
 */
/** Download the article's image and register it as a LinkedIn asset. */
async function uploadArticleImage(
  profile: Profile,
  imageUrl: string,
): Promise<string | null> {
  try {
    const { fetchImageBytes } = await import("@/lib/preview");
    const image = await fetchImageBytes(imageUrl);
    if (!image) return null;
    const { uploadImage } = await import("@/lib/linkedin");
    return await uploadImage(profile, image.bytes, image.contentType);
  } catch {
    return null;
  }
}

async function enrichLink(link: PostLink): Promise<PostLink> {
  try {
    const { fetchArticlePreview } = await import("@/lib/preview");
    const preview = await fetchArticlePreview(link.url);
    if (!preview.fetched) return link;
    return {
      ...link,
      title: preview.title ?? link.title,
      description: preview.description,
      imageUrl: preview.image,
    };
  } catch {
    return link;
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
  // link, and the card carries that article's own image.
  const bundle = await repo.getBriefBundle(draft.briefId, userId);
  const bare = sourceLink(bundle?.discourseItem ?? null);
  const link = bare ? await enrichLink(bare) : null;

  // "photo": upload the article's image and run it full-width. The media slot
  // is then taken, so the link moves into the body. Any failure here quietly
  // falls back to the card — the switch is a preference, never a blocker.
  let imageAsset: string | null = null;
  let body = draft.body;
  if ((draft.mediaStyle ?? "card") === "photo" && link?.imageUrl) {
    imageAsset = await uploadArticleImage(profile!, link.imageUrl);
    if (imageAsset) body = `${draft.body}\n\nvia ${link.url}`;
  }

  try {
    const postId = await postToLinkedIn(profile!, body, link, imageAsset);
    await repo.updateDraft(draftId, userId, {
      status: "posted",
      // The URN is the receipt — it's how the dashboard links to the live
      // post. Older LinkedIn responses could omit the header; keep null then.
      linkedinPostId: postId.startsWith("urn:") ? postId : null,
    });
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
