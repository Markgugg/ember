import "server-only";
import { z } from "zod";
import { FIXTURE_MODE } from "@/lib/env";
import type { DiscourseItem, DraftAngle, Insight } from "@/lib/types";
import { SONNET, structuredCall } from "./anthropic";
import { findBannedPhrases } from "./banned";
import { DRAFT_SYSTEM } from "./prompts/draft";
import { VOICE_SYSTEM } from "./prompts/voice";

export interface GeneratedDraft {
  angle: DraftAngle;
  rationale: string;
  body: string;
}

export interface DraftSet {
  drafts: GeneratedDraft[];
  primaryIndex: number;
  recommendation: string;
}

const draftSchema = z.object({
  drafts: z
    .array(
      z.object({
        angle: z.enum([
          "story",
          "contrarian",
          "framework",
          "prediction",
          "lesson",
          "commentary",
        ]),
        rationale: z.string().min(10),
        body: z.string().min(100).max(2200),
      }),
    )
    .length(3),
  primaryIndex: z.number().int().min(0).max(2),
  recommendation: z.string().min(10),
});

export interface DraftContext {
  insight: Insight;
  item: DiscourseItem | null;
  voiceSamples: string[];
  audience: string | null;
}

/** F6 — generate 3 angled drafts + pick the primary. Banned-phrase gate with one regeneration. */
export async function generateDrafts(ctx: DraftContext): Promise<DraftSet> {
  if (FIXTURE_MODE) return fixtureDrafts(ctx);

  const run = (nudge?: string) =>
    structuredCall({
      model: SONNET,
      system: DRAFT_SYSTEM,
      user: buildUser(ctx) + (nudge ? `\n\n${nudge}` : ""),
      toolName: "submit_drafts",
      toolDescription: "Submit the three angled drafts.",
      inputSchema: {
        type: "object",
        properties: {
          drafts: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: {
              type: "object",
              properties: {
                angle: {
                  type: "string",
                  enum: ["story", "contrarian", "framework", "prediction", "lesson", "commentary"],
                },
                rationale: { type: "string" },
                body: { type: "string" },
              },
              required: ["angle", "rationale", "body"],
            },
          },
          primaryIndex: { type: "integer", minimum: 0, maximum: 2 },
          recommendation: { type: "string" },
        },
        required: ["drafts", "primaryIndex", "recommendation"],
      },
      validator: draftSchema,
      maxTokens: 4096,
    });

  let set = await run();
  const violations = set.drafts.flatMap((d) => findBannedPhrases(d.body));
  if (violations.length > 0) {
    set = await run(
      `Your previous drafts used banned phrases: ${[...new Set(violations)].join(", ")}. Rewrite without them or any close variants.`,
    );
    const still = set.drafts.flatMap((d) => findBannedPhrases(d.body));
    if (still.length > 0) {
      throw new Error(`draft: banned phrases survived regeneration: ${still.join(", ")}`);
    }
  }
  return set;
}

/** F11 — rewrite one draft in the author's voice, claims preserved. */
export async function rewriteInVoice(
  body: string,
  voiceSamples: string[],
): Promise<string> {
  if (FIXTURE_MODE) {
    // Honest fixture: plainen — shorter sentences, no em-dash flourishes.
    return body
      .replace(/ — /g, ". ")
      .split("\n")
      .map((l) => l.trim())
      .join("\n");
  }
  const result = await structuredCall({
    model: SONNET,
    system: VOICE_SYSTEM,
    user: `Voice samples:\n${
      voiceSamples.length > 0
        ? voiceSamples.map((s, i) => `--- sample ${i + 1} ---\n${s}`).join("\n")
        : "(none provided)"
    }\n\nDraft to rewrite:\n"""\n${body}\n"""`,
    toolName: "submit_rewrite",
    toolDescription: "Submit the rewritten draft.",
    inputSchema: {
      type: "object",
      properties: { body: { type: "string" } },
      required: ["body"],
    },
    validator: z.object({ body: z.string().min(100).max(2200) }),
    maxTokens: 2048,
  });
  return result.body;
}

function buildUser(ctx: DraftContext): string {
  const parts = [
    `Insight (${ctx.insight.type}, authority ${ctx.insight.authority.toFixed(2)}, charge ${ctx.insight.charge.toFixed(2)}):\n${ctx.insight.text}`,
    `Their exact words: "${ctx.insight.quote}"`,
  ];
  if (ctx.item) {
    parts.push(
      `Live discourse: ${ctx.item.title} — ${ctx.item.summary}${
        ctx.item.stanceA ? `\nTension: "${ctx.item.stanceA}" vs "${ctx.item.stanceB}"` : ""
      }`,
    );
  } else {
    parts.push(
      "No live discourse hook — write from the insight alone; do not fabricate news.",
    );
  }
  if (ctx.audience) parts.push(`Audience: ${ctx.audience}`);
  parts.push(
    ctx.voiceSamples.length > 0
      ? `Voice samples:\n${ctx.voiceSamples.map((s, i) => `--- sample ${i + 1} ---\n${s}`).join("\n")}`
      : "No voice samples — write plainly.",
  );
  return parts.join("\n\n");
}

/* ── fixture drafts — angle-templated from real input ─────────────── */

function fixtureDrafts(ctx: DraftContext): DraftSet {
  const { insight, item } = ctx;
  const topic = item ? item.title : "this";
  const stance = item?.stanceA ?? "the loudest take in the room";
  // When the mined claim IS the quote (common), don't echo it twice.
  const quoteEchoes = normalized(insight.quote).includes(
    normalized(insight.text).slice(0, 60),
  );

  const story: GeneratedDraft = {
    angle: insight.type === "story" ? "story" : "commentary",
    rationale:
      insight.type === "story"
        ? "you lived this one — firsthand beats commentary every time."
        : `your take gives the ${truncate(topic, 50)} conversation something the thread is missing.`,
    body: `${hook(insight.text)}\n\n${
      quoteEchoes ? "" : `${insight.quote.trim()}\n\n`
    }That's not a hypothetical — it's what actually happened.\n\n${
      item ? `Everyone arguing about ${truncate(topic, 80)} right now is missing this part.` : "Most people arguing about this have never watched it happen."
    }\n\nThe uncomfortable part: it'll keep happening until we stop pretending otherwise.`,
  };

  const contrarian: GeneratedDraft = {
    angle: "contrarian",
    rationale: `most people believe "${truncate(stance, 60)}" — you don't, and you can say why.`,
    body: `Everyone keeps saying: ${truncate(stance, 100)}\n\nI don't buy it.\n\n${insight.text}${
      quoteEchoes
        ? ""
        : `\n\nIn my own words from this week: "${truncate(insight.quote.trim(), 180)}"`
    }\n\nMaybe I'm wrong. But nobody making the popular argument has addressed this yet.`,
  };

  const lesson: GeneratedDraft = {
    angle: insight.type === "lesson" ? "lesson" : "framework",
    rationale:
      insight.type === "lesson"
        ? "a mistake plus a correction is the most trusted shape on this platform."
        : "your point generalizes into something people can reuse — that's save-bait in the good way.",
    body: `${hook(insight.text)}\n\nHere's what I keep coming back to:\n\n1. ${insight.text}\n2. The obvious approach fails quietly, not loudly — that's why it survives.\n3. Fix the contract before you fix the code.\n\n${item ? `With the ${truncate(topic, 70)} debate heating up, worth saying out loud.` : "Filed under: things I wish someone had told me earlier."}`,
  };

  const drafts = [story, contrarian, lesson];
  const primaryIndex = insight.charge > 0.6 ? 1 : insight.authority > 0.6 ? 0 : 2;
  return {
    drafts,
    primaryIndex,
    recommendation:
      primaryIndex === 1
        ? "I'd post the contrarian one — your conviction is the asset here, and the thread is live right now."
        : primaryIndex === 0
          ? "I'd post the first one — you lived it, and firsthand always beats hot takes."
          : "I'd post the framework one — it's the most reusable, and reusable gets saved.",
  };
}

function hook(text: string): string {
  const t = text.replace(/^i think\s*/i, "").trim();
  const capped = t.charAt(0).toUpperCase() + t.slice(1);
  return truncate(capped.replace(/\.$/, "") + ".", 118);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function normalized(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
