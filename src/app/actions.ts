"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRepo } from "@/lib/db";
import { getUserId } from "@/lib/identity";
import { rewriteInVoice } from "@/lib/ai/draft";
import { stripVtt } from "@/lib/ai/transcribe";
import {
  getConversations,
  getStories,
  type ConversationView,
  type StoryView,
} from "@/lib/view";

/* ── profile ──────────────────────────────────────────────────────── */

/** Client-safe profile view — the LinkedIn token NEVER crosses to the browser. */
export interface ProfileView {
  displayName: string | null;
  headline: string | null;
  audience: string | null;
  linkedinUrl: string | null;
  beats: string[];
  voiceSamples: string[];
  linkedinConnected: boolean;
}

export async function loadProfile(): Promise<ProfileView | null> {
  const repo = await getRepo();
  const p = await repo.getProfile(await getUserId());
  if (!p) return null;
  const { linkedinReady } = await import("@/lib/linkedin");
  return {
    displayName: p.displayName,
    headline: p.headline,
    audience: p.audience,
    linkedinUrl: p.linkedinUrl,
    beats: p.beats,
    voiceSamples: p.voiceSamples,
    linkedinConnected: linkedinReady(p),
  };
}

const profileSchema = z.object({
  displayName: z.string().max(100).optional(),
  headline: z.string().max(300).optional(),
  audience: z.string().max(200).optional(),
  linkedinUrl: z.string().max(300).optional(),
  beats: z.array(z.string().max(60)).max(8).optional(),
  voiceSamples: z.array(z.string().max(5000)).max(3).optional(),
});

export async function saveProfile(
  input: z.infer<typeof profileSchema>,
): Promise<void> {
  const parsed = profileSchema.parse(input);
  const repo = await getRepo();
  const userId = await getUserId();
  const existing = await repo.getProfile(userId);
  const or = <T,>(next: T | undefined, prev: T | null): T | null =>
    next === undefined ? prev : next || null;
  await repo.upsertProfile({
    id: userId,
    displayName: or(parsed.displayName?.trim(), existing?.displayName ?? null),
    headline: or(parsed.headline?.trim(), existing?.headline ?? null),
    audience: or(parsed.audience?.trim(), existing?.audience ?? null),
    linkedinUrl: or(parsed.linkedinUrl?.trim(), existing?.linkedinUrl ?? null),
    beats:
      parsed.beats?.map((b) => b.trim()).filter(Boolean) ??
      existing?.beats ??
      [],
    voiceSamples:
      parsed.voiceSamples?.map((s) => s.trim()).filter(Boolean) ??
      existing?.voiceSamples ??
      [],
    onboardedAt: existing?.onboardedAt ?? new Date().toISOString(),
    linkedinUrn: existing?.linkedinUrn ?? null,
    linkedinAccessToken: existing?.linkedinAccessToken ?? null,
    linkedinTokenExpiresAt: existing?.linkedinTokenExpiresAt ?? null,
  });
  revalidatePath("/", "layout");
}

/* ── composer sources ─────────────────────────────────────────────── */

export interface ComposerSources {
  stories: StoryView[];
  conversations: ConversationView[];
  live: boolean;
  linkedinConnected: boolean;
  /** Does the user hold any un-posted insight for a pinned story to meet? */
  hasClaims: boolean;
}

export interface StoryPreview {
  id: string;
  /** What Current thinks the argument is. */
  title: string;
  summary: string;
  stanceA: string | null;
  stanceB: string | null;
  buzz: string;
  discussionUrl: string;
  /** The article itself, as LinkedIn will see it. Null for HN self-posts. */
  article: {
    url: string;
    domain: string;
    title: string | null;
    description: string | null;
    image: string | null;
    siteName: string | null;
    fetched: boolean;
  } | null;
}

/**
 * The right pane while you're still choosing: what this story actually says.
 * The article metadata is the same Open Graph data LinkedIn reads for its
 * preview card, so what you see here is what your post will carry.
 */
export async function loadStoryPreview(
  storyId: string,
): Promise<StoryPreview | null> {
  const repo = await getRepo();
  const item = await repo.getDiscourseItem(storyId);
  if (!item) return null;

  const source = item.sources[0];
  const articleUrl = source?.articleUrl ?? null;
  const { sanitizePunctuation } = await import("@/lib/ai/style");

  let article: StoryPreview["article"] = null;
  if (articleUrl) {
    const { fetchArticlePreview } = await import("@/lib/preview");
    article = await fetchArticlePreview(articleUrl);
  }

  return {
    id: item.id,
    title: sanitizePunctuation(item.title),
    summary: sanitizePunctuation(item.summary),
    stanceA: item.stanceA,
    stanceB: item.stanceB,
    buzz: source?.meta ?? "",
    discussionUrl: source?.url ?? "https://news.ycombinator.com/",
    article,
  };
}

/** Everything the composer sheet needs to let you pick a story and a conversation. */
export async function loadComposerSources(): Promise<ComposerSources> {
  const userId = await getUserId();
  const repo = await getRepo();
  const { linkedinReady } = await import("@/lib/linkedin");
  const [{ stories, live }, conversations, profile, insights] =
    await Promise.all([
      getStories(),
      getConversations(userId),
      repo.getProfile(userId),
      repo.listInsights(userId),
    ]);
  return {
    stories,
    conversations,
    live,
    linkedinConnected: linkedinReady(profile),
    // "From the news" pins a story and draws the claim from everything you've
    // ever said. With an empty bank it can only refuse, so the UI says so
    // up front instead of letting you click into a dead end.
    hasClaims: insights.some((i) => i.status !== "posted"),
  };
}

/**
 * Onboarding: scan the LinkedIn URL into an editable profile draft.
 * `pastedProfileText` (your own About/headline text) is the honest way past
 * LinkedIn's authwall — it beats any scrape because it's authoritative.
 *
 * The URL may be empty when OAuth already verified the member: `openid
 * profile` gives us a name but no vanity URL, and a name is enough to draft.
 */
export async function scanLinkedinProfile(
  url: string,
  pastedProfileText?: string,
  verifiedName?: string,
) {
  const trimmed = url.trim();
  if (trimmed && !/linkedin\.com\/in\/[^/?#]+/i.test(trimmed)) {
    throw new Error("That doesn't look like a linkedin.com/in/… profile URL.");
  }
  if (!trimmed && !verifiedName?.trim()) {
    throw new Error("Paste your linkedin.com/in/… profile URL to continue.");
  }
  const { scanLinkedin } = await import("@/lib/scan");
  return scanLinkedin(trimmed, pastedProfileText, verifiedName?.trim());
}

/** Is the LinkedIn OAuth app configured? Drives the onboarding connect button. */
export async function linkedinAvailable(): Promise<boolean> {
  const { linkedinConfigured } = await import("@/lib/linkedin");
  return linkedinConfigured();
}

/** Onboarding's live scan step. */
export async function loadPulsePreview(): Promise<
  { title: string; meta: string; live: boolean }[]
> {
  const { stories, live } = await getStories();
  return stories.slice(0, 3).map((s) => ({
    title: s.title,
    meta: s.buzz || s.domain,
    live,
  }));
}

/* ── transcripts ──────────────────────────────────────────────────── */

/** Bank a conversation without drafting from it yet ("Add to library"). */
export async function addTranscript(
  rawText: string,
  source: "paste" | "upload" | "voice" = "paste",
): Promise<{ id: string }> {
  const text = stripVtt(rawText).trim();
  if (text.length < 40) throw new Error("too short");
  const repo = await getRepo();
  const userId = await getUserId();
  const transcript = await repo.insertTranscript({
    userId,
    source,
    rawText: text,
    wordCount: text.split(/\s+/).length,
  });
  revalidatePath("/transcripts");
  revalidatePath("/");
  return { id: transcript.id };
}

/* ── drafts ───────────────────────────────────────────────────────── */

export async function saveDraftEdit(
  draftId: string,
  body: string,
): Promise<void> {
  const repo = await getRepo();
  const userId = await getUserId();
  const draft = await repo.getDraft(draftId, userId);
  if (!draft) throw new Error("draft not found");
  if (draft.body === body) return;
  await repo.updateDraft(draftId, userId, {
    body,
    status: draft.status === "suggested" ? "edited" : draft.status,
    editDiff: draft.editDiff ?? { before: draft.body, after: body },
  });
}

/** Copy = assumed posted. We never ask the user to file paperwork. */
export async function markDraftCopied(draftId: string): Promise<void> {
  const repo = await getRepo();
  const userId = await getUserId();
  const draft = await repo.getDraft(draftId, userId);
  if (!draft) return;
  await repo.updateDraft(draftId, userId, { status: "posted" });
  const bundle = await repo.getBriefBundle(draft.briefId, userId);
  if (bundle?.brief.insightId) {
    await repo.updateInsightStatus(bundle.brief.insightId, userId, "posted");
    await repo.updateBriefStatus(draft.briefId, userId, "consumed");
  }
  revalidatePath("/queue");
  revalidatePath("/");
}

/** A planned slot is a reminder — Current never posts on your behalf. */
export async function planDraft(
  draftId: string,
  isoTime: string | null,
): Promise<void> {
  const repo = await getRepo();
  const userId = await getUserId();
  await repo.updateDraft(draftId, userId, { plannedFor: isoTime });
  revalidatePath("/queue");
  revalidatePath("/");
}

/** Post one draft to the connected LinkedIn account, right now. */
export async function postDraftNow(
  draftId: string,
): Promise<{ ok: boolean; message: string }> {
  const { publishDraft } = await import("@/lib/publish");
  const repo = await getRepo();
  const userId = await getUserId();
  const result = await publishDraft(repo, userId, draftId);
  revalidatePath("/queue");
  revalidatePath("/");
  return result.ok
    ? { ok: true, message: "Posted to LinkedIn." }
    : { ok: false, message: result.error };
}

export async function notMyVoice(draftId: string): Promise<string> {
  const repo = await getRepo();
  const userId = await getUserId();
  const draft = await repo.getDraft(draftId, userId);
  if (!draft) throw new Error("draft not found");
  const profile = await repo.getProfile(userId);
  const rewritten = await rewriteInVoice(draft.body, profile?.voiceSamples ?? []);
  await repo.updateDraft(draftId, userId, { body: rewritten });
  return rewritten;
}

/** The composer's right pane: the primary draft of a finished brief. */
export async function loadBriefDraft(briefId: string): Promise<{
  draftId: string;
  body: string;
  angle: string;
  rationale: string;
  sourceNote: string;
  /** Card vs full-width photo — the member's per-draft choice. */
  mediaStyle: "card" | "photo";
  /**
   * The article the post cites, and the card it will carry.
   *  "card"  — image, headline, domain and link in one clickable unit
   *  "plain" — the article has no image, so the card has no picture
   */
  link: { url: string; domain: string; shape: "card" | "plain" } | null;
} | null> {
  const repo = await getRepo();
  const userId = await getUserId();
  const bundle = await repo.getBriefBundle(briefId, userId);
  if (!bundle) return null;
  const primary = bundle.drafts.find((d) => d.isPrimary) ?? bundle.drafts[0];
  if (!primary) return null;
  const parts = [
    bundle.discourseItem
      ? `${bundle.discourseItem.title} (${bundle.discourseItem.sources[0]?.domain ?? "live"})`
      : null,
    bundle.insight ? `your words: “${truncate(bundle.insight.quote, 70)}”` : null,
  ].filter(Boolean);

  const { sourceLink } = await import("@/lib/publish");
  const attached = sourceLink(bundle.discourseItem);
  const source = bundle.discourseItem?.sources?.[0];

  // Cached from the story-preview pane, so this is usually free.
  let shape: "card" | "plain" = "plain";
  if (attached) {
    const { fetchArticlePreview } = await import("@/lib/preview");
    const preview = await fetchArticlePreview(attached.url);
    shape = preview.fetched && preview.image ? "card" : "plain";
  }

  return {
    draftId: primary.id,
    body: primary.body,
    angle: primary.angle,
    rationale: primary.rationale,
    sourceNote: parts.join(" + "),
    mediaStyle: primary.mediaStyle ?? "card",
    link: attached
      ? { url: attached.url, domain: source?.domain ?? "link", shape }
      : null,
  };
}

/** The card/photo switch. Persisted on the draft so scheduled posts honour it. */
export async function setDraftMediaStyle(
  draftId: string,
  style: "card" | "photo",
): Promise<void> {
  const repo = await getRepo();
  const userId = await getUserId();
  await repo.updateDraft(draftId, userId, { mediaStyle: style });
}

function truncate(s: string, n: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length <= n ? clean : `${clean.slice(0, n - 1)}…`;
}
