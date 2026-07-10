import "server-only";
import { z } from "zod";
import { FIXTURE_MODE } from "@/lib/env";
import { HAIKU, structuredCall } from "@/lib/ai/anthropic";

/**
 * Onboarding scan — Taplio's "we read your profile" step, done honestly.
 *
 * LinkedIn authwalls anonymous profile reads, so this is best-effort:
 *   1. the /in/<slug> gives us a name guess for free
 *   2. we attempt the public page; when LinkedIn lets a title/description
 *      through, we use it
 *   3. AI (or a heuristic in fixture mode) drafts headline/audience/beats
 *      from whatever we actually got
 * The result is a PRE-FILL for the review screen, never a silent truth —
 * `profileFetched` tells the UI to say what it could and couldn't read.
 */

export interface ScanResult {
  name: string;
  headline: string;
  audience: string;
  beats: string[];
  /** Did LinkedIn let us read anything beyond the URL itself? */
  profileFetched: boolean;
}

const scanSchema = z.object({
  headline: z.string().max(300),
  audience: z.string().max(160),
  beats: z.array(z.string().min(2).max(40)).min(2).max(5),
});

const SCAN_SYSTEM = `You draft a LinkedIn content profile for the onboarding of Current, an AI LinkedIn post tool. From the fragments provided (a name, sometimes a page title or description scraped from their public profile), draft:
- "headline": 1-2 sentences of who they are, first person, plain, no buzzwords. If you only have a name, write a neutral placeholder they'll edit (e.g. "I build things and write about what I learn.") — never invent employers, schools, or achievements.
- "audience": who plausibly reads them (short phrase). Generic is fine; invented specifics are not.
- "beats": 3-5 short topics they'd credibly post about. From real fragments if present, otherwise sensible defaults for a tech professional.
Never fabricate facts. Vague-but-editable beats invented-but-specific.`;

export async function scanLinkedin(
  url: string,
  /** Text the member pasted from their own profile — the authwall's only honest bypass. */
  pastedProfileText?: string,
  /** Name confirmed by OAuth. Outranks the slug guess and the page title. */
  verifiedName?: string,
): Promise<ScanResult> {
  const slug = extractSlug(url);
  const nameGuess = verifiedName || (slug ? nameFromSlug(slug) : "");
  const pasted = pastedProfileText?.trim().slice(0, 4000) ?? "";

  // Best-effort public read — usually authwalled, occasionally generous.
  let pageTitle = "";
  let pageDescription = "";
  try {
    if (!url) throw new Error("no url");
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const html = (await res.text()).slice(0, 200_000);
      pageTitle = decode(match(html, /<title[^>]*>([^<]{5,200})<\/title>/i));
      pageDescription = decode(
        match(
          html,
          /<meta[^>]+(?:property="og:description"|name="description")[^>]+content="([^"]{10,400})"/i,
        ),
      );
      if (/authwall|sign in|join linkedin/i.test(pageTitle)) {
        pageTitle = "";
        pageDescription = "";
      }
    }
  } catch {
    /* blocked or slow — expected; the URL alone still helps */
  }

  const profileFetched = Boolean(pageTitle || pageDescription || pasted);
  // LinkedIn public titles look like "Name - Headline | LinkedIn"
  const titleName = pageTitle.split(/\s+-\s+/)[0]?.replace(/\|.*$/, "").trim();
  const titleHeadline = pageTitle.includes(" - ")
    ? pageTitle.split(/\s+-\s+/).slice(1).join(" - ").replace(/\|\s*LinkedIn.*$/i, "").trim()
    : "";
  const name = verifiedName || (profileFetched && titleName) || nameGuess;

  if (FIXTURE_MODE) {
    return {
      name,
      headline:
        firstSentences(pasted, 2) ||
        titleHeadline ||
        pageDescription.split(".")[0] ||
        (name
          ? `I'm ${name.split(" ")[0]} — I build things and write about what I learn.`
          : "I build things and write about what I learn."),
      audience: "people in tech who ship things",
      beats: pasted
        ? keywordBeats(pasted)
        : ["AI & engineering", "building products", "lessons from shipping"],
      profileFetched,
    };
  }

  const drafted = await structuredCall({
    model: HAIKU,
    system: SCAN_SYSTEM,
    user: [
      `Name: ${name || "(unknown)"}`,
      `Profile URL: ${url}`,
      pageTitle && `Public page title: ${pageTitle}`,
      pageDescription && `Public page description: ${pageDescription}`,
      pasted &&
        `The member pasted this from their own LinkedIn profile — treat it as authoritative:\n"""\n${pasted}\n"""`,
      !profileFetched &&
        "Note: LinkedIn blocked the anonymous read — only the URL and name are real.",
    ]
      .filter(Boolean)
      .join("\n"),
    toolName: "draft_profile",
    toolDescription: "Draft the editable content profile.",
    inputSchema: {
      type: "object",
      properties: {
        headline: { type: "string" },
        audience: { type: "string" },
        beats: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
      },
      required: ["headline", "audience", "beats"],
    },
    validator: scanSchema,
    maxTokens: 600,
  });

  return { name, ...drafted, profileFetched };
}

/* ── helpers ──────────────────────────────────────────────────────── */

function extractSlug(url: string): string | null {
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

/** "mark-guggenheim-1a2b3c" → "Mark Guggenheim" (id junk dropped). */
function nameFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter((part) => !/^\d/.test(part) && !/^[0-9a-f]{6,}$/i.test(part))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .trim();
}

function match(html: string, re: RegExp): string {
  return html.match(re)?.[1]?.trim() ?? "";
}

function firstSentences(text: string, n: number): string {
  if (!text) return "";
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s/)
    .slice(0, n)
    .join(" ")
    .trim();
}

/**
 * Fixture-mode beats. With an Anthropic key this whole function is bypassed —
 * Haiku reads the pasted profile properly. Here we match known topics rather
 * than "most capitalised word", which otherwise returns things like
 * "San" and "Diego" from a university name.
 */
const TOPIC_PATTERNS: [RegExp, string][] = [
  [/\bAI agents?\b|\bagentic\b/i, "AI agents"],
  [/\bLLMs?\b|\blarge language model/i, "LLMs"],
  [/\bRAG\b|\bpinecone\b|\bvector (db|database|search)/i, "RAG & retrieval"],
  [/\bmachine learning\b|\bML\b/i, "machine learning"],
  [/\bfull[- ]stack\b/i, "full-stack engineering"],
  [/\bTypeScript\b|\bJavaScript\b/i, "TypeScript"],
  [/\bNext\.js\b|\bReact\b/i, "React & Next.js"],
  [/\bPython\b/i, "Python"],
  [/\bSupabase\b|\bPostgres\b|\bSQL\b/i, "databases"],
  [/\bfounder\b|\bco[- ]?founder\b|\bstartup\b/i, "startups & founding"],
  [/\bship(ping|ped)?\b|\bbuild(ing)? (real )?products?\b/i, "shipping products"],
  [/\bintern(ship)?\b|\bstudent\b/i, "breaking into tech"],
  [/\bdesign\b|\bUX\b|\bUI\b/i, "product design"],
  [/\bdev ?ops\b|\binfrastructure\b|\bcloud\b/i, "infrastructure"],
  [/\bsecurity\b/i, "security"],
  [/\bgrowth\b|\bmarketing\b/i, "growth"],
];

function keywordBeats(text: string): string[] {
  const hits = TOPIC_PATTERNS.filter(([re]) => re.test(text)).map(([, label]) => label);
  const unique = [...new Set(hits)].slice(0, 5);
  return unique.length >= 2
    ? unique
    : [...unique, "AI & engineering", "building products"].slice(0, 3);
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
