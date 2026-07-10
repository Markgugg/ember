import { randomUUID } from "crypto";
import { cosineSimilarity } from "@/lib/vector";
import type {
  Brief,
  BriefBundle,
  BriefStatus,
  DiscourseItem,
  Draft,
  Insight,
  InsightStatus,
  Profile,
  Transcript,
} from "@/lib/types";
import type { DraftPatch, NewBrief, NewDraft, NewInsight, NewTranscript, Repo } from "./repo";

/**
 * Credential-free dev/fixture store. Survives Next.js HMR via a globalThis
 * singleton; data lives until the dev server restarts. Never used when
 * Supabase is configured (see db/index.ts).
 */
interface MemoryState {
  profiles: Map<string, Profile>;
  transcripts: Map<string, Transcript>;
  insights: Map<string, Insight>;
  discourse: DiscourseItem[];
  briefs: Map<string, Brief>;
  drafts: Map<string, Draft>;
  suppressions: Set<string>;
}

const g = globalThis as typeof globalThis & { __emberMemoryDb?: MemoryState };

function state(): MemoryState {
  if (!g.__emberMemoryDb) {
    g.__emberMemoryDb = {
      profiles: new Map(),
      transcripts: new Map(),
      insights: new Map(),
      discourse: [],
      briefs: new Map(),
      drafts: new Map(),
      suppressions: new Set(),
    };
  }
  return g.__emberMemoryDb;
}

const now = () => new Date().toISOString();
const suppressionKey = (u: string, i: string, d: string) => `${u}:${i}:${d}`;

function bundle(s: MemoryState, brief: Brief): BriefBundle {
  return {
    brief,
    insight: brief.insightId ? (s.insights.get(brief.insightId) ?? null) : null,
    discourseItem: brief.discourseItemId
      ? (s.discourse.find((d) => d.id === brief.discourseItemId) ?? null)
      : null,
    drafts: [...s.drafts.values()]
      .filter((d) => d.briefId === brief.id)
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
  };
}

export const memoryRepo: Repo = {
  async getProfile(userId) {
    return state().profiles.get(userId) ?? null;
  },
  async upsertProfile(profile) {
    state().profiles.set(profile.id, profile);
    return profile;
  },

  async insertTranscript(t: NewTranscript) {
    const row: Transcript = { ...t, id: randomUUID(), createdAt: now() };
    state().transcripts.set(row.id, row);
    return row;
  },
  async listTranscripts(userId) {
    return [...state().transcripts.values()]
      .filter((t) => t.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async getTranscript(id, userId) {
    const t = state().transcripts.get(id);
    return t && t.userId === userId ? t : null;
  },

  async listInsights(userId) {
    return [...state().insights.values()]
      .filter((i) => i.userId === userId)
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  },
  async listInsightsByTranscript(transcriptId, userId) {
    return [...state().insights.values()].filter(
      (i) => i.userId === userId && i.transcriptId === transcriptId,
    );
  },
  async getInsight(id, userId) {
    const i = state().insights.get(id);
    return i && i.userId === userId ? i : null;
  },
  async findSimilarInsight(userId, embedding, threshold) {
    let best: Insight | null = null;
    let bestSim = threshold;
    for (const i of state().insights.values()) {
      if (i.userId !== userId) continue;
      const sim = cosineSimilarity(i.embedding, embedding);
      if (sim >= bestSim) {
        best = i;
        bestSim = sim;
      }
    }
    return best;
  },
  async insertInsight(i: NewInsight) {
    const row: Insight = {
      ...i,
      id: randomUUID(),
      recurrence: 1,
      status: "vaulted",
      lastSeenAt: now(),
      createdAt: now(),
    };
    state().insights.set(row.id, row);
    return row;
  },
  async touchInsightRecurrence(id, userId) {
    const i = state().insights.get(id);
    if (i && i.userId === userId) {
      i.recurrence += 1;
      i.lastSeenAt = now();
    }
  },
  async updateInsightStatus(id, userId, status: InsightStatus) {
    const i = state().insights.get(id);
    if (i && i.userId === userId) i.status = status;
  },
  async deleteInsight(id, userId) {
    const i = state().insights.get(id);
    if (!i || i.userId !== userId) return null;
    state().insights.delete(id);
    return i;
  },
  async restoreInsight(insight) {
    state().insights.set(insight.id, insight);
  },

  async getDiscourseItem(id) {
    return state().discourse.find((d) => d.id === id) ?? null;
  },
  async latestSnapshot() {
    const s = state();
    if (s.discourse.length === 0) return [];
    const latest = s.discourse.reduce(
      (max, d) => (d.snapshotAt > max ? d.snapshotAt : max),
      s.discourse[0].snapshotAt,
    );
    return s.discourse.filter((d) => d.snapshotAt === latest);
  },
  async insertSnapshot(items) {
    const rows = items.map((i) => ({ ...i, id: randomUUID() }));
    // keep only the two most recent snapshots
    const s = state();
    s.discourse.push(...rows);
    const snapshots = [...new Set(s.discourse.map((d) => d.snapshotAt))]
      .sort()
      .reverse()
      .slice(0, 2);
    s.discourse = s.discourse.filter((d) => snapshots.includes(d.snapshotAt));
    return rows;
  },

  async insertBrief(b: NewBrief) {
    const row: Brief = {
      ...b,
      status: b.status ?? "suggested",
      id: randomUUID(),
      createdAt: now(),
    };
    state().briefs.set(row.id, row);
    return row;
  },
  async getBriefBundle(id, userId) {
    const s = state();
    const b = s.briefs.get(id);
    if (!b || b.userId !== userId) return null;
    return bundle(s, b);
  },
  async listBriefBundles(userId) {
    const s = state();
    return [...s.briefs.values()]
      .filter((b) => b.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((b) => bundle(s, b));
  },
  async latestPrerunBrief(userId) {
    const s = state();
    const b = [...s.briefs.values()]
      .filter(
        (x) =>
          x.userId === userId && x.origin === "prerun" && x.status === "suggested",
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return b ? bundle(s, b) : null;
  },
  async updateBriefStatus(id, userId, status: BriefStatus) {
    const b = state().briefs.get(id);
    if (b && b.userId === userId) b.status = status;
  },
  async deleteSuggestedPrerunBriefs(userId) {
    const s = state();
    for (const [id, b] of s.briefs) {
      if (b.userId === userId && b.origin === "prerun" && b.status === "suggested") {
        for (const [did, d] of s.drafts) {
          if (d.briefId === id) s.drafts.delete(did);
        }
        s.briefs.delete(id);
      }
    }
  },

  async insertDrafts(drafts: NewDraft[]) {
    const rows = drafts.map(
      (d): Draft => ({
        ...d,
        id: randomUUID(),
        status: "suggested",
        editDiff: null,
        plannedFor: null,
        createdAt: now(),
      }),
    );
    for (const r of rows) state().drafts.set(r.id, r);
    return rows;
  },
  async listDrafts(userId) {
    const s = state();
    return [...s.drafts.values()]
      .filter((d) => s.briefs.get(d.briefId)?.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async getDraft(id, userId) {
    const s = state();
    const d = s.drafts.get(id);
    if (!d) return null;
    const b = s.briefs.get(d.briefId);
    return b && b.userId === userId ? d : null;
  },
  async updateDraft(id, userId, patch: DraftPatch) {
    const d = await this.getDraft(id, userId);
    if (!d) return null;
    Object.assign(d, patch);
    return d;
  },

  async addSuppression(userId, insightId, discourseItemId) {
    state().suppressions.add(suppressionKey(userId, insightId, discourseItemId));
  },
  async isSuppressed(userId, insightId, discourseItemId) {
    return state().suppressions.has(
      suppressionKey(userId, insightId, discourseItemId),
    );
  },

  async deleteAllUserData(userId) {
    const s = state();
    s.profiles.delete(userId);
    for (const [id, t] of s.transcripts) if (t.userId === userId) s.transcripts.delete(id);
    for (const [id, i] of s.insights) if (i.userId === userId) s.insights.delete(id);
    for (const [id, b] of s.briefs) {
      if (b.userId === userId) {
        for (const [did, d] of s.drafts) if (d.briefId === id) s.drafts.delete(did);
        s.briefs.delete(id);
      }
    }
    for (const key of s.suppressions) {
      if (key.startsWith(`${userId}:`)) s.suppressions.delete(key);
    }
  },

  async claimUserData(fromUserId, toUserId) {
    const s = state();
    for (const t of s.transcripts.values())
      if (t.userId === fromUserId) t.userId = toUserId;
    for (const i of s.insights.values())
      if (i.userId === fromUserId) i.userId = toUserId;
    for (const b of s.briefs.values())
      if (b.userId === fromUserId) b.userId = toUserId;
    const fromProfile = s.profiles.get(fromUserId);
    if (fromProfile && !s.profiles.has(toUserId)) {
      s.profiles.set(toUserId, { ...fromProfile, id: toUserId });
      s.profiles.delete(fromUserId);
    }
    for (const key of [...s.suppressions]) {
      if (key.startsWith(`${fromUserId}:`)) {
        s.suppressions.delete(key);
        s.suppressions.add(key.replace(`${fromUserId}:`, `${toUserId}:`));
      }
    }
  },
};
