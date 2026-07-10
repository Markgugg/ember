import "server-only";
import { getRepo } from "@/lib/db";
import { getOrSeedSnapshot } from "@/lib/discourse";
import type { DiscourseItem, Draft, Insight } from "@/lib/types";

/**
 * Client-safe view models. Embeddings (1536 floats each) never cross the
 * server/client boundary, and nothing here fabricates a number.
 */

export interface StoryView {
  id: string;
  title: string;
  summary: string;
  stanceA: string | null;
  stanceB: string | null;
  velocity: number;
  kicker: string;
  /** Domain monogram + deterministic hue — no scraped article images. */
  mono: string;
  hue: number;
  url: string;
  domain: string;
  buzz: string;
}

export interface ConversationView {
  id: string;
  name: string;
  meta: string;
  createdAt: string;
  angles: { id: string; text: string; type: string; recurrence: number }[];
}

export interface QueuedDraftView {
  id: string;
  briefId: string;
  angle: string;
  title: string;
  status: string;
  plannedFor: string | null;
  createdAt: string;
}

export function toStoryView(item: DiscourseItem): StoryView {
  const src = item.sources[0];
  const domain = src?.domain ?? "news.ycombinator.com";
  const age = src ? formatAge(src.ageHours) : "";
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    stanceA: item.stanceA,
    stanceB: item.stanceB,
    velocity: item.velocity,
    kicker: `${domain.replace(/^www\./, "").split(".")[0].toUpperCase()}${age ? ` · ${age.toUpperCase()}` : ""}`,
    mono: monogram(domain),
    hue: hueOf(domain),
    url: src?.url ?? "https://news.ycombinator.com/",
    domain,
    buzz: src?.meta ?? "",
  };
}

/** A conversation's display name: its opening clause, not a filename. */
export function conversationName(rawText: string): string {
  const firstSentence = rawText
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s/)[0]
    .trim();
  const name = firstSentence.length > 4 ? firstSentence : rawText.slice(0, 60);
  return name.length > 62 ? `${name.slice(0, 61)}…` : name;
}

export async function getStories(): Promise<{
  stories: StoryView[];
  live: boolean;
  snapshotAgeHours: number | null;
}> {
  const repo = await getRepo();
  const { items, live } = await getOrSeedSnapshot(repo);
  const sorted = [...items].sort((a, b) => b.velocity - a.velocity);
  return {
    stories: sorted.map(toStoryView),
    live,
    snapshotAgeHours:
      items.length > 0
        ? (Date.now() - new Date(items[0].snapshotAt).getTime()) / 3_600_000
        : null,
  };
}

export async function getConversations(
  userId: string,
): Promise<ConversationView[]> {
  const repo = await getRepo();
  const [transcripts, insights] = await Promise.all([
    repo.listTranscripts(userId),
    repo.listInsights(userId),
  ]);
  const byTranscript = new Map<string, Insight[]>();
  for (const i of insights) {
    const list = byTranscript.get(i.transcriptId) ?? [];
    list.push(i);
    byTranscript.set(i.transcriptId, list);
  }
  return transcripts.map((t) => {
    const angles = (byTranscript.get(t.id) ?? []).sort(
      (a, b) => b.authority + b.charge - (a.authority + a.charge),
    );
    return {
      id: t.id,
      name: conversationName(t.rawText),
      meta: `${t.wordCount.toLocaleString()} words · ${
        angles.length === 0
          ? "no angles yet"
          : `${angles.length} post ${angles.length === 1 ? "angle" : "angles"} found`
      }`,
      createdAt: t.createdAt,
      angles: angles.map((a) => ({
        id: a.id,
        text: a.text,
        type: a.type,
        recurrence: a.recurrence,
      })),
    };
  });
}

export function draftTitle(draft: Draft): string {
  const firstLine = draft.body.split("\n")[0].trim();
  return firstLine.length > 64 ? `${firstLine.slice(0, 63)}…` : firstLine;
}

export function formatAge(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 24) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
}

function monogram(domain: string): string {
  const base = domain.replace(/^www\./, "").split(".")[0];
  return base.slice(0, 2).toUpperCase();
}

/** Stable hue per domain so a source always wears the same colour. */
function hueOf(domain: string): number {
  let h = 0;
  for (let i = 0; i < domain.length; i++) {
    h = (h * 31 + domain.charCodeAt(i)) % 360;
  }
  return h;
}
