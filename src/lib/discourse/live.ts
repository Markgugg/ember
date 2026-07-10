import "server-only";
import { z } from "zod";
import { FIXTURE_MODE } from "@/lib/env";
import { HAIKU, structuredCall } from "@/lib/ai/anthropic";
import { embedBatch } from "@/lib/ai/embeddings";
import type { DiscourseItem } from "@/lib/types";

/**
 * Live discourse — real-time "what is the AI world arguing about", pulled
 * from Hacker News (Algolia API, free, keyless) at session time.
 *
 * With an Anthropic key: a Haiku call clusters stories into discourse items
 * with tensions (stance A vs stance B). Without: each top story becomes an
 * item heuristically. Either way the data is genuinely live.
 */

interface HNStory {
  objectID: string;
  title: string;
  url: string | null;
  points: number;
  num_comments: number;
  created_at_i: number;
}

const AI_PATTERN =
  /\b(ai|llm|llms|gpt|claude|openai|anthropic|gemini|deepseek|mistral|copilot|agent|agents|agentic|model|models|transformer|rag|inference|fine-?tun|prompt|neural|machine learning|ml)\b/i;

async function fetchJson(url: string): Promise<{ hits: HNStory[] }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`hn ${res.status}`);
  return res.json();
}

/** Front page + top AI stories from the last 24h, deduped, engagement-ranked. */
export async function fetchAiStories(): Promise<HNStory[]> {
  const since = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  const [front, recent] = await Promise.all([
    fetchJson(
      "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30",
    ),
    fetchJson(
      `https://hn.algolia.com/api/v1/search?query=AI&tags=story&numericFilters=created_at_i>${since},points>20&hitsPerPage=30`,
    ),
  ]);

  const seen = new Set<string>();
  return [...front.hits, ...recent.hits]
    .filter((s) => {
      if (!s.title || seen.has(s.objectID)) return false;
      seen.add(s.objectID);
      return AI_PATTERN.test(s.title);
    })
    .sort(
      (a, b) => b.points + b.num_comments * 2 - (a.points + a.num_comments * 2),
    )
    .slice(0, 18);
}

/** The board never shows more than this. Nine live conversations, ranked. */
export const MAX_DISCOURSE_ITEMS = 9;

const clusterSchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string().min(5),
        summary: z.string().min(20),
        stanceA: z.string().nullable(),
        stanceB: z.string().nullable(),
        storyIndexes: z.array(z.number().int().min(0)).min(1),
      }),
    )
    .min(1)
    .max(MAX_DISCOURSE_ITEMS),
});

const CLUSTER_SYSTEM = `You are the discourse mapper of ember. You receive today's AI-related Hacker News stories. Cluster them into 5-9 discourse items, the conversations people are actually having, not headlines. For each: a title phrased as the conversation ("Are agents ready for production?" not "Company ships agent"), a 1-2 sentence summary of what's being argued, and where a genuine disagreement exists, the two stances (stanceA vs stanceB), null for both when the story isn't divisive. Reference source stories by index. Skip stories that are pure product announcements with nothing arguable. Never use em dashes, en dashes, or semicolons in a title or summary; write plain sentences instead.`;

/** Build DiscourseItems from live stories — Haiku clustering or heuristic mapping. */
export async function buildLiveItems(
  snapshotAt: string,
): Promise<Omit<DiscourseItem, "id">[]> {
  const stories = await fetchAiStories();
  if (stories.length === 0) throw new Error("no AI stories found");

  const now = Date.now() / 1000;
  const maxEngagement = Math.max(
    ...stories.map((s) => s.points + s.num_comments * 2),
  );
  const toSource = (s: HNStory) => ({
    url: `https://news.ycombinator.com/item?id=${s.objectID}`,
    // Keep the underlying article, not just its domain: it's the only link
    // worth attaching to a post, and the only one with a preview image.
    articleUrl: s.url ?? null,
    domain: s.url ? safeDomain(s.url) : "news.ycombinator.com",
    ageHours: Math.max(0, (now - s.created_at_i) / 3600),
    meta: `${s.num_comments} comments`,
  });
  const velocityOf = (list: HNStory[]) =>
    Math.min(
      1,
      list.reduce((sum, s) => sum + s.points + s.num_comments * 2, 0) /
        Math.max(1, maxEngagement),
    );

  let raw: {
    title: string;
    summary: string;
    stanceA: string | null;
    stanceB: string | null;
    stories: HNStory[];
  }[];

  if (FIXTURE_MODE) {
    // Keyless: one item per story. Live data, heuristic shape.
    raw = stories.slice(0, MAX_DISCOURSE_ITEMS).map((s) => ({
      title: s.title,
      summary: s.title,
      stanceA: null,
      stanceB: null,
      stories: [s],
    }));
  } else {
    const clustered = await structuredCall({
      model: HAIKU,
      system: CLUSTER_SYSTEM,
      user: stories
        .map(
          (s, i) =>
            `${i}. ${s.title} (${s.points} points, ${s.num_comments} comments)`,
        )
        .join("\n"),
      toolName: "report_discourse",
      toolDescription: "Report the clustered discourse items.",
      inputSchema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            minItems: 1,
            maxItems: MAX_DISCOURSE_ITEMS,
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                summary: { type: "string" },
                stanceA: { type: ["string", "null"] },
                stanceB: { type: ["string", "null"] },
                storyIndexes: { type: "array", items: { type: "integer" } },
              },
              required: ["title", "summary", "stanceA", "stanceB", "storyIndexes"],
            },
          },
        },
        required: ["items"],
      },
      validator: clusterSchema,
      maxTokens: 2048,
    });
    raw = clustered.items.map((c) => ({
      title: c.title,
      summary: c.summary,
      stanceA: c.stanceA,
      stanceB: c.stanceB,
      stories: c.storyIndexes
        .filter((i) => i < stories.length)
        .map((i) => stories[i]),
    }));
  }

  // A cluster with no surviving source story can't be cited, so drop it.
  // Then rank by engagement and keep the top nine: that ordering is what
  // rotates yesterday's quiet threads off the board as louder ones arrive.
  raw = raw
    .filter((r) => r.stories.length > 0)
    .sort((a, b) => velocityOf(b.stories) - velocityOf(a.stories))
    .slice(0, MAX_DISCOURSE_ITEMS);

  const embeddings = await embedBatch(
    raw.map(
      (r) =>
        `${r.title} ${r.summary} ${r.stanceA ?? ""} ${r.stanceB ?? ""} ${r.stories
          .map((s) => s.title)
          .join(" ")}`,
    ),
  );

  return raw.map((r, i) => ({
    snapshotAt,
    title: r.title,
    summary: r.summary,
    stanceA: r.stanceA,
    stanceB: r.stanceB,
    velocity: velocityOf(r.stories),
    sources: r.stories.slice(0, 3).map(toSource),
    embedding: embeddings[i],
  }));
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "news.ycombinator.com";
  }
}
