/** Domain types — the shared vocabulary of the app. Mirrors supabase/migrations/0001_init.sql. */

export type TranscriptSource = "voice" | "paste" | "upload";
export type InsightType = "opinion" | "story" | "lesson";
export type InsightStatus = "vaulted" | "drafted" | "posted";
export type BriefOrigin = "session" | "prerun" | "library";
export type BriefStatus = "suggested" | "consumed" | "dismissed" | "refused";
export type DraftAngle =
  | "story"
  | "contrarian"
  | "framework"
  | "prediction"
  | "lesson"
  | "commentary";
export type DraftStatus = "suggested" | "edited" | "copied" | "posted";

export interface Profile {
  id: string;
  displayName: string | null;
  /** One-line "who you are" — used in prompts and the post preview header. */
  headline: string | null;
  audience: string | null;
  linkedinUrl: string | null;
  voiceSamples: string[];
  onboardedAt: string | null;
}

export interface Transcript {
  id: string;
  userId: string;
  source: TranscriptSource;
  rawText: string;
  wordCount: number;
  createdAt: string;
}

export interface Insight {
  id: string;
  userId: string;
  transcriptId: string;
  text: string;
  /** Verbatim supporting excerpt from the transcript. */
  quote: string;
  type: InsightType;
  /** 0–1 — firsthand-evidence heuristic. */
  authority: number;
  /** 0–1 — emotional/contrarian energy. */
  charge: number;
  recurrence: number;
  status: InsightStatus;
  embedding: number[];
  lastSeenAt: string;
  createdAt: string;
}

export interface DiscourseSource {
  url: string;
  domain: string;
  ageHours: number;
  meta?: string;
}

export interface DiscourseItem {
  id: string;
  snapshotAt: string;
  title: string;
  summary: string;
  /** The tension — null when the item isn't (yet) divisive. */
  stanceA: string | null;
  stanceB: string | null;
  /** 0–1 composite of comment volume and recency. */
  velocity: number;
  sources: DiscourseSource[];
  embedding: number[];
}

export interface Brief {
  id: string;
  userId: string;
  insightId: string | null;
  discourseItemId: string | null;
  intersectionScore: number | null;
  intersectionRationale: string | null;
  recommendation: string | null;
  /** Refusal payload when status = refused. */
  refusal: {
    closestMiss: string;
    reason: string;
    redirectTopic: string;
    redirectLine: string;
  } | null;
  origin: BriefOrigin;
  status: BriefStatus;
  createdAt: string;
}

export interface Draft {
  id: string;
  briefId: string;
  angle: DraftAngle;
  rationale: string;
  body: string;
  isPrimary: boolean;
  status: DraftStatus;
  editDiff: { before: string; after: string } | null;
  /**
   * A slot you planned for this post. A reminder only — Current never posts
   * on your behalf, so nothing fires at this time.
   */
  plannedFor: string | null;
  createdAt: string;
}

/** A brief joined with everything the Brief page needs. */
export interface BriefBundle {
  brief: Brief;
  insight: Insight | null;
  discourseItem: DiscourseItem | null;
  drafts: Draft[];
}
