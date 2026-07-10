import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import type {
  Brief,
  BriefBundle,
  DiscourseItem,
  Draft,
  Insight,
  Profile,
  Transcript,
} from "@/lib/types";
import type { DraftPatch, NewBrief, NewDraft, NewInsight, NewTranscript, Repo } from "./repo";

/**
 * Production repo — service-role client, every query explicitly scoped by
 * userId (RLS still guards the anon/browser path; the service role is used
 * only inside server code that never trusts a client-supplied userId).
 */

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (!_admin) {
    if (!serverEnv.supabaseUrl || !serverEnv.supabaseServiceRoleKey) {
      throw new Error(
        "Supabase repo requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
      );
    }
    _admin = createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
  }
  return _admin;
}

/** pgvector round-trips as a "[0.1,0.2]" string; normalize to number[]. */
function parseVector(v: unknown): number[] {
  if (Array.isArray(v)) return v as number[];
  if (typeof v === "string") return JSON.parse(v) as number[];
  return [];
}

/* ── row mappers ──────────────────────────────────────────────────── */
/* eslint-disable @typescript-eslint/no-explicit-any */

const toProfile = (r: any): Profile => ({
  id: r.id,
  displayName: r.display_name,
  headline: r.headline,
  audience: r.audience,
  linkedinUrl: r.linkedin_url,
  voiceSamples: r.voice_samples ?? [],
  onboardedAt: r.onboarded_at,
});

const toTranscript = (r: any): Transcript => ({
  id: r.id,
  userId: r.user_id,
  source: r.source,
  rawText: r.raw_text,
  wordCount: r.word_count,
  createdAt: r.created_at,
});

const toInsight = (r: any): Insight => ({
  id: r.id,
  userId: r.user_id,
  transcriptId: r.transcript_id,
  text: r.text,
  quote: r.quote,
  type: r.type,
  authority: r.authority,
  charge: r.charge,
  recurrence: r.recurrence,
  status: r.status,
  embedding: parseVector(r.embedding),
  lastSeenAt: r.last_seen_at,
  createdAt: r.created_at,
});

const toDiscourse = (r: any): DiscourseItem => ({
  id: r.id,
  snapshotAt: r.snapshot_at,
  title: r.title,
  summary: r.summary,
  stanceA: r.stance_a,
  stanceB: r.stance_b,
  velocity: r.velocity,
  sources: r.sources ?? [],
  embedding: parseVector(r.embedding),
});

const toBrief = (r: any): Brief => ({
  id: r.id,
  userId: r.user_id,
  insightId: r.insight_id,
  discourseItemId: r.discourse_item_id,
  intersectionScore: r.intersection_score,
  intersectionRationale: r.intersection_rationale,
  recommendation: r.recommendation,
  refusal: r.refusal,
  origin: r.origin,
  status: r.status,
  createdAt: r.created_at,
});

const toDraft = (r: any): Draft => ({
  id: r.id,
  briefId: r.brief_id,
  angle: r.angle,
  rationale: r.rationale,
  body: r.body,
  isPrimary: r.is_primary,
  status: r.status,
  editDiff: r.edit_diff,
  plannedFor: r.planned_for ?? null,
  createdAt: r.created_at,
});

/* eslint-enable @typescript-eslint/no-explicit-any */

function throwOn(error: { message: string } | null, op: string) {
  if (error) throw new Error(`db:${op}: ${error.message}`);
}

async function bundleFor(brief: Brief): Promise<BriefBundle> {
  const [insightRes, discourseRes, draftsRes] = await Promise.all([
    brief.insightId
      ? admin().from("insights").select("*").eq("id", brief.insightId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    brief.discourseItemId
      ? admin()
          .from("discourse_items")
          .select("*")
          .eq("id", brief.discourseItemId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin()
      .from("drafts")
      .select("*")
      .eq("brief_id", brief.id)
      .order("is_primary", { ascending: false }),
  ]);
  throwOn(insightRes.error, "bundle.insight");
  throwOn(discourseRes.error, "bundle.discourse");
  throwOn(draftsRes.error, "bundle.drafts");
  return {
    brief,
    insight: insightRes.data ? toInsight(insightRes.data) : null,
    discourseItem: discourseRes.data ? toDiscourse(discourseRes.data) : null,
    drafts: (draftsRes.data ?? []).map(toDraft),
  };
}

export const supabaseRepo: Repo = {
  async getProfile(userId) {
    const { data, error } = await admin()
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    throwOn(error, "getProfile");
    return data ? toProfile(data) : null;
  },
  async upsertProfile(p) {
    const { data, error } = await admin()
      .from("profiles")
      .upsert({
        id: p.id,
        display_name: p.displayName,
        headline: p.headline,
        audience: p.audience,
        linkedin_url: p.linkedinUrl,
        voice_samples: p.voiceSamples,
        onboarded_at: p.onboardedAt,
      })
      .select()
      .single();
    throwOn(error, "upsertProfile");
    return toProfile(data);
  },

  async insertTranscript(t: NewTranscript) {
    const { data, error } = await admin()
      .from("transcripts")
      .insert({
        user_id: t.userId,
        source: t.source,
        raw_text: t.rawText,
        word_count: t.wordCount,
      })
      .select()
      .single();
    throwOn(error, "insertTranscript");
    return toTranscript(data);
  },
  async listTranscripts(userId) {
    const { data, error } = await admin()
      .from("transcripts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    throwOn(error, "listTranscripts");
    return (data ?? []).map(toTranscript);
  },
  async getTranscript(id, userId) {
    const { data, error } = await admin()
      .from("transcripts")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    throwOn(error, "getTranscript");
    return data ? toTranscript(data) : null;
  },

  async listInsights(userId) {
    const { data, error } = await admin()
      .from("insights")
      .select("*")
      .eq("user_id", userId)
      .order("last_seen_at", { ascending: false });
    throwOn(error, "listInsights");
    return (data ?? []).map(toInsight);
  },
  async listInsightsByTranscript(transcriptId, userId) {
    const { data, error } = await admin()
      .from("insights")
      .select("*")
      .eq("transcript_id", transcriptId)
      .eq("user_id", userId);
    throwOn(error, "listInsightsByTranscript");
    return (data ?? []).map(toInsight);
  },
  async getInsight(id, userId) {
    const { data, error } = await admin()
      .from("insights")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    throwOn(error, "getInsight");
    return data ? toInsight(data) : null;
  },
  async findSimilarInsight(userId, embedding, threshold) {
    const { data, error } = await admin().rpc("match_insights", {
      p_user_id: userId,
      p_embedding: JSON.stringify(embedding),
      p_threshold: threshold,
      p_limit: 1,
    });
    throwOn(error, "findSimilarInsight");
    const hit = data?.[0];
    return hit ? this.getInsight(hit.id, userId) : null;
  },
  async insertInsight(i: NewInsight) {
    const { data, error } = await admin()
      .from("insights")
      .insert({
        user_id: i.userId,
        transcript_id: i.transcriptId,
        text: i.text,
        quote: i.quote,
        type: i.type,
        authority: i.authority,
        charge: i.charge,
        embedding: JSON.stringify(i.embedding),
      })
      .select()
      .single();
    throwOn(error, "insertInsight");
    return toInsight(data);
  },
  async touchInsightRecurrence(id, userId) {
    const existing = await this.getInsight(id, userId);
    if (!existing) return;
    const { error } = await admin()
      .from("insights")
      .update({
        recurrence: existing.recurrence + 1,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId);
    throwOn(error, "touchInsightRecurrence");
  },
  async updateInsightStatus(id, userId, status) {
    const { error } = await admin()
      .from("insights")
      .update({ status })
      .eq("id", id)
      .eq("user_id", userId);
    throwOn(error, "updateInsightStatus");
  },
  async deleteInsight(id, userId) {
    const existing = await this.getInsight(id, userId);
    if (!existing) return null;
    const { error } = await admin()
      .from("insights")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    throwOn(error, "deleteInsight");
    return existing;
  },
  async restoreInsight(i) {
    const { error } = await admin().from("insights").insert({
      id: i.id,
      user_id: i.userId,
      transcript_id: i.transcriptId,
      text: i.text,
      quote: i.quote,
      type: i.type,
      authority: i.authority,
      charge: i.charge,
      recurrence: i.recurrence,
      status: i.status,
      embedding: JSON.stringify(i.embedding),
      last_seen_at: i.lastSeenAt,
      created_at: i.createdAt,
    });
    throwOn(error, "restoreInsight");
  },

  async getDiscourseItem(id) {
    const { data, error } = await admin()
      .from("discourse_items")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    throwOn(error, "getDiscourseItem");
    return data ? toDiscourse(data) : null;
  },
  async latestSnapshot() {
    const { data: latest, error: e1 } = await admin()
      .from("discourse_items")
      .select("snapshot_at")
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwOn(e1, "latestSnapshot.head");
    if (!latest) return [];
    const { data, error } = await admin()
      .from("discourse_items")
      .select("*")
      .eq("snapshot_at", latest.snapshot_at);
    throwOn(error, "latestSnapshot");
    return (data ?? []).map(toDiscourse);
  },
  async insertSnapshot(items) {
    const { data, error } = await admin()
      .from("discourse_items")
      .insert(
        items.map((i) => ({
          snapshot_at: i.snapshotAt,
          title: i.title,
          summary: i.summary,
          stance_a: i.stanceA,
          stance_b: i.stanceB,
          velocity: i.velocity,
          sources: i.sources,
          embedding: JSON.stringify(i.embedding),
        })),
      )
      .select();
    throwOn(error, "insertSnapshot");
    return (data ?? []).map(toDiscourse);
  },

  async insertBrief(b: NewBrief) {
    const { data, error } = await admin()
      .from("briefs")
      .insert({
        user_id: b.userId,
        insight_id: b.insightId,
        discourse_item_id: b.discourseItemId,
        intersection_score: b.intersectionScore,
        intersection_rationale: b.intersectionRationale,
        recommendation: b.recommendation,
        refusal: b.refusal,
        origin: b.origin,
        status: b.status ?? "suggested",
      })
      .select()
      .single();
    throwOn(error, "insertBrief");
    return toBrief(data);
  },
  async getBriefBundle(id, userId) {
    const { data, error } = await admin()
      .from("briefs")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    throwOn(error, "getBriefBundle");
    return data ? bundleFor(toBrief(data)) : null;
  },
  async listBriefBundles(userId) {
    const { data, error } = await admin()
      .from("briefs")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    throwOn(error, "listBriefBundles");
    return Promise.all((data ?? []).map((r) => bundleFor(toBrief(r))));
  },
  async latestPrerunBrief(userId) {
    const { data, error } = await admin()
      .from("briefs")
      .select("*")
      .eq("user_id", userId)
      .eq("origin", "prerun")
      .eq("status", "suggested")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwOn(error, "latestPrerunBrief");
    return data ? bundleFor(toBrief(data)) : null;
  },
  async updateBriefStatus(id, userId, status) {
    const { error } = await admin()
      .from("briefs")
      .update({ status })
      .eq("id", id)
      .eq("user_id", userId);
    throwOn(error, "updateBriefStatus");
  },
  async deleteSuggestedPrerunBriefs(userId) {
    const { error } = await admin()
      .from("briefs")
      .delete()
      .eq("user_id", userId)
      .eq("origin", "prerun")
      .eq("status", "suggested");
    throwOn(error, "deleteSuggestedPrerunBriefs");
  },

  async insertDrafts(drafts: NewDraft[]) {
    const { data, error } = await admin()
      .from("drafts")
      .insert(
        drafts.map((d) => ({
          brief_id: d.briefId,
          angle: d.angle,
          rationale: d.rationale,
          body: d.body,
          is_primary: d.isPrimary,
        })),
      )
      .select();
    throwOn(error, "insertDrafts");
    return (data ?? []).map(toDraft);
  },
  async listDrafts(userId) {
    const { data, error } = await admin()
      .from("drafts")
      .select("*, briefs!inner(user_id)")
      .eq("briefs.user_id", userId)
      .order("created_at", { ascending: false });
    throwOn(error, "listDrafts");
    return (data ?? []).map(toDraft);
  },
  async getDraft(id, userId) {
    const { data, error } = await admin()
      .from("drafts")
      .select("*, briefs!inner(user_id)")
      .eq("id", id)
      .eq("briefs.user_id", userId)
      .maybeSingle();
    throwOn(error, "getDraft");
    return data ? toDraft(data) : null;
  },
  async updateDraft(id, userId, patch: DraftPatch) {
    const owned = await this.getDraft(id, userId);
    if (!owned) return null;
    const { data, error } = await admin()
      .from("drafts")
      .update({
        ...(patch.body !== undefined && { body: patch.body }),
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.editDiff !== undefined && { edit_diff: patch.editDiff }),
        ...(patch.rationale !== undefined && { rationale: patch.rationale }),
        ...(patch.plannedFor !== undefined && { planned_for: patch.plannedFor }),
      })
      .eq("id", id)
      .select()
      .single();
    throwOn(error, "updateDraft");
    return toDraft(data);
  },

  async addSuppression(userId, insightId, discourseItemId) {
    const { error } = await admin().from("prerun_suppressions").upsert({
      user_id: userId,
      insight_id: insightId,
      discourse_item_id: discourseItemId,
    });
    throwOn(error, "addSuppression");
  },
  async isSuppressed(userId, insightId, discourseItemId) {
    const { data, error } = await admin()
      .from("prerun_suppressions")
      .select("user_id")
      .eq("user_id", userId)
      .eq("insight_id", insightId)
      .eq("discourse_item_id", discourseItemId)
      .maybeSingle();
    throwOn(error, "isSuppressed");
    return Boolean(data);
  },

  async deleteAllUserData(userId) {
    // FK cascades handle transcripts→insights→drafts etc.
    for (const table of ["briefs", "insights", "transcripts", "profiles"]) {
      const col = table === "profiles" ? "id" : "user_id";
      const { error } = await admin().from(table).delete().eq(col, userId);
      throwOn(error, `deleteAllUserData.${table}`);
    }
  },

  async claimUserData(fromUserId, toUserId) {
    for (const table of ["transcripts", "insights", "briefs"]) {
      const { error } = await admin()
        .from(table)
        .update({ user_id: toUserId })
        .eq("user_id", fromUserId);
      throwOn(error, `claimUserData.${table}`);
    }
    const fromProfile = await this.getProfile(fromUserId);
    const toProfile = await this.getProfile(toUserId);
    if (fromProfile && !toProfile) {
      await this.upsertProfile({ ...fromProfile, id: toUserId });
    }
    await admin().from("profiles").delete().eq("id", fromUserId);
  },
};
