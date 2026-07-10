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
import type { Profile } from "@/lib/types";

/* ── profile ──────────────────────────────────────────────────────── */

export async function loadProfile(): Promise<Profile | null> {
  const repo = await getRepo();
  return repo.getProfile(await getUserId());
}

const profileSchema = z.object({
  displayName: z.string().max(100).optional(),
  headline: z.string().max(300).optional(),
  audience: z.string().max(200).optional(),
  linkedinUrl: z.string().max(300).optional(),
  voiceSamples: z.array(z.string().max(5000)).max(3).optional(),
});

export async function saveProfile(
  input: z.infer<typeof profileSchema>,
): Promise<Profile> {
  const parsed = profileSchema.parse(input);
  const repo = await getRepo();
  const userId = await getUserId();
  const existing = await repo.getProfile(userId);
  const or = <T,>(next: T | undefined, prev: T | null): T | null =>
    next === undefined ? prev : next || null;
  const profile = await repo.upsertProfile({
    id: userId,
    displayName: or(parsed.displayName?.trim(), existing?.displayName ?? null),
    headline: or(parsed.headline?.trim(), existing?.headline ?? null),
    audience: or(parsed.audience?.trim(), existing?.audience ?? null),
    linkedinUrl: or(parsed.linkedinUrl?.trim(), existing?.linkedinUrl ?? null),
    voiceSamples:
      parsed.voiceSamples?.map((s) => s.trim()).filter(Boolean) ??
      existing?.voiceSamples ??
      [],
    onboardedAt: existing?.onboardedAt ?? new Date().toISOString(),
  });
  revalidatePath("/", "layout");
  return profile;
}

/* ── composer sources ─────────────────────────────────────────────── */

export interface ComposerSources {
  stories: StoryView[];
  conversations: ConversationView[];
  live: boolean;
}

/** Everything the composer sheet needs to let you pick a story and a conversation. */
export async function loadComposerSources(): Promise<ComposerSources> {
  const userId = await getUserId();
  const [{ stories, live }, conversations] = await Promise.all([
    getStories(),
    getConversations(userId),
  ]);
  return { stories, conversations, live };
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
  return {
    draftId: primary.id,
    body: primary.body,
    angle: primary.angle,
    rationale: primary.rationale,
    sourceNote: parts.join(" + "),
  };
}

function truncate(s: string, n: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length <= n ? clean : `${clean.slice(0, n - 1)}…`;
}
