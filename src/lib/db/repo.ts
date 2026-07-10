import type {
  Brief,
  BriefBundle,
  BriefStatus,
  DiscourseItem,
  Draft,
  DraftStatus,
  Insight,
  InsightStatus,
  MediaStyle,
  Profile,
  Transcript,
} from "@/lib/types";

export type NewTranscript = Omit<Transcript, "id" | "createdAt">;
export type NewInsight = Omit<
  Insight,
  "id" | "recurrence" | "status" | "lastSeenAt" | "createdAt"
>;
export type NewBrief = Omit<Brief, "id" | "createdAt" | "status"> & {
  status?: BriefStatus;
};
export type NewDraft = Omit<
  Draft,
  | "id"
  | "createdAt"
  | "status"
  | "editDiff"
  | "plannedFor"
  | "mediaStyle"
  | "linkedinPostId"
>;

export interface DraftPatch {
  body?: string;
  status?: DraftStatus;
  editDiff?: { before: string; after: string } | null;
  rationale?: string;
  /** Reminder slot only — Current never auto-posts. */
  plannedFor?: string | null;
  /** Compact card vs full-width photo — the per-draft switch. */
  mediaStyle?: MediaStyle;
  /** The URN LinkedIn returned at publish — the link back to the real post. */
  linkedinPostId?: string | null;
}

/**
 * Repository contract. Two implementations:
 *  - supabase.ts — production (Postgres + pgvector, RLS enforced at the DB)
 *  - memory.ts — credential-free dev/fixture store (globalThis singleton)
 * All methods take userId explicitly; implementations must scope every query by it.
 */
export interface Repo {
  // profiles
  getProfile(userId: string): Promise<Profile | null>;
  upsertProfile(profile: Profile): Promise<Profile>;

  // transcripts
  insertTranscript(t: NewTranscript): Promise<Transcript>;
  listTranscripts(userId: string): Promise<Transcript[]>;
  getTranscript(id: string, userId: string): Promise<Transcript | null>;

  // insights
  listInsights(userId: string): Promise<Insight[]>;
  listInsightsByTranscript(
    transcriptId: string,
    userId: string,
  ): Promise<Insight[]>;
  getInsight(id: string, userId: string): Promise<Insight | null>;
  /** Highest-similarity insight above threshold, or null. Dedupe path (F3). */
  findSimilarInsight(
    userId: string,
    embedding: number[],
    threshold: number,
  ): Promise<Insight | null>;
  insertInsight(i: NewInsight): Promise<Insight>;
  /** recurrence += 1, last_seen_at = now. */
  touchInsightRecurrence(id: string, userId: string): Promise<void>;
  updateInsightStatus(
    id: string,
    userId: string,
    status: InsightStatus,
  ): Promise<void>;
  /** Returns the deleted row so the caller can offer undo. */
  deleteInsight(id: string, userId: string): Promise<Insight | null>;
  restoreInsight(insight: Insight): Promise<void>;

  // discourse (shared)
  getDiscourseItem(id: string): Promise<DiscourseItem | null>;
  latestSnapshot(): Promise<DiscourseItem[]>;
  insertSnapshot(
    items: Omit<DiscourseItem, "id">[],
  ): Promise<DiscourseItem[]>;
  /**
   * One story added outside the feed pull — an article the member brought
   * themselves. No pruning here; it lives or dies with the snapshot rules.
   */
  insertDiscourseItem(item: Omit<DiscourseItem, "id">): Promise<DiscourseItem>;

  // briefs
  insertBrief(b: NewBrief): Promise<Brief>;
  getBriefBundle(id: string, userId: string): Promise<BriefBundle | null>;
  listBriefBundles(userId: string): Promise<BriefBundle[]>;
  latestPrerunBrief(userId: string): Promise<BriefBundle | null>;
  updateBriefStatus(
    id: string,
    userId: string,
    status: BriefStatus,
  ): Promise<void>;
  /** Replace-old rule for pre-run briefs (max 1 unconsumed). */
  deleteSuggestedPrerunBriefs(userId: string): Promise<void>;

  // drafts
  insertDrafts(drafts: NewDraft[]): Promise<Draft[]>;
  listDrafts(userId: string): Promise<Draft[]>;
  /** Across ALL users: unposted drafts whose planned slot has come due. */
  listDueDrafts(nowIso: string): Promise<{ draft: Draft; userId: string }[]>;
  getDraft(id: string, userId: string): Promise<Draft | null>;
  updateDraft(
    id: string,
    userId: string,
    patch: DraftPatch,
  ): Promise<Draft | null>;

  // prerun suppressions
  addSuppression(
    userId: string,
    insightId: string,
    discourseItemId: string,
  ): Promise<void>;
  isSuppressed(
    userId: string,
    insightId: string,
    discourseItemId: string,
  ): Promise<boolean>;

  // account
  deleteAllUserData(userId: string): Promise<void>;
  /** Reassign anon rows to the signed-in user (F1 claim flow). */
  claimUserData(fromUserId: string, toUserId: string): Promise<void>;
}
