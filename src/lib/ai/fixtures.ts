import "server-only";

/**
 * Fixture-mode intelligence — deterministic, key-free stand-ins for every
 * AI call. Deliberately NOT canned responses: they are cheap heuristics over
 * the real input, so the full product loop (mine → embed → match → draft)
 * behaves believably on arbitrary transcripts during dev, tests, and demos.
 */

export const EMBEDDING_DIM = 1536;

/** Deterministic bag-of-words pseudo-embedding. Token-overlap ≈ cosine similarity. */
export function pseudoEmbedding(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIM).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  for (const token of tokens) {
    // FNV-1a
    let h = 0x811c9dc5;
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    vec[(h >>> 0) % EMBEDDING_DIM] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

const OPINION_MARKERS = [
  "i think",
  "i believe",
  "i'm convinced",
  "honestly",
  "the real",
  "the problem is",
  "the thing is",
  "everyone",
  "nobody",
  "most people",
  "hot take",
  "unpopular",
  "we should",
  "you should",
  "the mistake",
];
const STORY_MARKERS = [
  "we tried",
  "we built",
  "we shipped",
  "when i",
  "last week",
  "yesterday",
  "happened",
  "we saw",
  "i saw",
  "at work",
  "our team",
  "my team",
];
const LESSON_MARKERS = [
  "i learned",
  "learned that",
  "lesson",
  "turns out",
  "realized",
  "the takeaway",
  "never again",
  "next time",
  "wish i",
];

export interface FixtureInsight {
  text: string;
  quote: string;
  type: "opinion" | "story" | "lesson";
  authority: number;
  charge: number;
}

/** Sentence-level heuristic miner. Quotes are verbatim substrings by construction. */
export function fixtureMine(transcript: string): FixtureInsight[] {
  const sentences = transcript
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 8);

  const scored = sentences
    .map((sentence) => {
      const lower = sentence.toLowerCase();
      const opinion = OPINION_MARKERS.filter((m) => lower.includes(m)).length;
      const story = STORY_MARKERS.filter((m) => lower.includes(m)).length;
      const lesson = LESSON_MARKERS.filter((m) => lower.includes(m)).length;
      const total = opinion + story + lesson;
      if (total === 0) return null;
      const type =
        story >= opinion && story >= lesson
          ? ("story" as const)
          : lesson >= opinion
            ? ("lesson" as const)
            : ("opinion" as const);
      return {
        text: sentence.replace(/^(so|and|but|like|um|uh)[,\s]+/i, "").trim(),
        quote: sentence,
        type,
        authority: Math.min(1, 0.35 + story * 0.3 + lesson * 0.15),
        charge: Math.min(1, 0.3 + opinion * 0.25),
      };
    })
    .filter((x): x is FixtureInsight => x !== null);

  // strongest first, cap at 6, dedupe near-identical sentences
  const seen = new Set<string>();
  const out: FixtureInsight[] = [];
  for (const s of scored.sort((a, b) => b.authority + b.charge - (a.authority + a.charge))) {
    const key = s.text.slice(0, 60).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length === 6) break;
  }
  return out;
}

/** The canned discourse snapshot used when feeds can't be pulled or clustered. */
export function fixtureDiscourse(snapshotAt: string) {
  const items = [
    {
      title: "Are AI agents actually ready for production?",
      summary:
        "A wave of postmortems is dividing builders: some say agent systems fail at handoff and state, others blame prompting and tooling immaturity.",
      stanceA: "Agents are overhyped — they fail in production and burn trust.",
      stanceB: "Agents work today if you scope them ruthlessly.",
      velocity: 0.9,
      sources: [
        { url: "https://news.ycombinator.com/", domain: "news.ycombinator.com", ageHours: 6, meta: "400+ comments" },
      ],
    },
    {
      title: "Vibe coding and the death of the junior engineer",
      summary:
        "Fast AI-assisted building is colliding with hiring: teams argue whether shipping speed now beats fundamentals, and what that does to career ladders.",
      stanceA: "Fundamentals matter more than ever — AI amplifies seniors.",
      stanceB: "Shipping fast with AI is the new fundamental.",
      velocity: 0.75,
      sources: [
        { url: "https://news.ycombinator.com/", domain: "news.ycombinator.com", ageHours: 11, meta: "250+ comments" },
      ],
    },
    {
      title: "RAG is dead, long live context windows",
      summary:
        "Million-token contexts have builders arguing whether retrieval pipelines are legacy plumbing or still the only way to ground production systems.",
      stanceA: "Big context kills most RAG use cases.",
      stanceB: "Retrieval remains essential for freshness, cost, and provenance.",
      velocity: 0.6,
      sources: [
        { url: "https://news.ycombinator.com/", domain: "news.ycombinator.com", ageHours: 20, meta: "180 comments" },
      ],
    },
    {
      title: "The AI pricing reset: usage-based everything",
      summary:
        "A cluster of repricing announcements has founders debating whether seat pricing survives AI products at all.",
      stanceA: "Seats are dead — AI value scales with usage.",
      stanceB: "Usage pricing kills adoption; hybrid wins.",
      velocity: 0.5,
      sources: [
        { url: "https://news.ycombinator.com/", domain: "news.ycombinator.com", ageHours: 26, meta: "120 comments" },
      ],
    },
  ];
  return items.map((i) => ({
    ...i,
    snapshotAt,
    embedding: pseudoEmbedding(`${i.title} ${i.summary} ${i.stanceA} ${i.stanceB}`),
  }));
}

