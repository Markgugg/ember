"use server";

import { z } from "zod";
import { getRepo } from "@/lib/db";
import { getUserId } from "@/lib/identity";
import { rewriteInVoice } from "@/lib/ai/draft";
import type { Profile } from "@/lib/types";

/* ── profile (F13-lite: voice samples + audience) ─────────────────── */

export async function loadProfile(): Promise<Profile | null> {
  const repo = await getRepo();
  return repo.getProfile(await getUserId());
}

const profileSchema = z.object({
  audience: z.string().max(200),
  voiceSamples: z.array(z.string().max(5000)).max(3),
});

export async function saveProfile(input: {
  audience: string;
  voiceSamples: string[];
}): Promise<Profile> {
  const parsed = profileSchema.parse(input);
  const repo = await getRepo();
  const userId = await getUserId();
  const existing = await repo.getProfile(userId);
  return repo.upsertProfile({
    id: userId,
    audience: parsed.audience.trim() || null,
    linkedinUrl: existing?.linkedinUrl ?? null,
    voiceSamples: parsed.voiceSamples.map((s) => s.trim()).filter(Boolean),
    onboardedAt: existing?.onboardedAt ?? new Date().toISOString(),
  });
}

/* ── drafts (F10/F11) ─────────────────────────────────────────────── */

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
    // first edit pins the original; later edits keep it
    editDiff: draft.editDiff ?? { before: draft.body, after: body },
  });
}

/** Copy = assumed posted (the post-critique rule: never ask the user to file paperwork). */
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
}

/** F11 — "Not my voice": regenerate in the author's register, claims intact. */
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
