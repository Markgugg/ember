import "server-only";
import { z } from "zod";
import { FIXTURE_MODE } from "@/lib/env";
import { SONNET, structuredCall } from "./anthropic";
import { fixtureMine } from "./fixtures";
import { MINE_SYSTEM } from "./prompts/mine";

export interface MinedInsight {
  text: string;
  quote: string;
  type: "opinion" | "story" | "lesson";
  authority: number;
  charge: number;
}

const minedSchema = z.object({
  insights: z.array(
    z.object({
      text: z.string().min(10),
      quote: z.string().min(10),
      type: z.enum(["opinion", "story", "lesson"]),
      authority: z.number().min(0).max(1),
      charge: z.number().min(0).max(1),
    }),
  ),
});

/**
 * F3 — extract insights from a transcript.
 * Quote-substring validation happens HERE, not in the model: a non-verbatim
 * quote rejects that insight (never the batch).
 */
export async function mineInsights(transcript: string): Promise<MinedInsight[]> {
  const raw = FIXTURE_MODE
    ? fixtureMine(transcript)
    : (
        await structuredCall({
          model: SONNET,
          system: MINE_SYSTEM,
          user: `Transcript:\n"""\n${transcript}\n"""`,
          toolName: "report_insights",
          toolDescription: "Report the insights mined from the transcript.",
          inputSchema: {
            type: "object",
            properties: {
              insights: {
                type: "array",
                maxItems: 6,
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    quote: { type: "string" },
                    type: { type: "string", enum: ["opinion", "story", "lesson"] },
                    authority: { type: "number", minimum: 0, maximum: 1 },
                    charge: { type: "number", minimum: 0, maximum: 1 },
                  },
                  required: ["text", "quote", "type", "authority", "charge"],
                },
              },
            },
            required: ["insights"],
          },
          validator: minedSchema,
          maxTokens: 2048,
        })
      ).insights;

  // Hard provenance gate — the product's honesty rule as code.
  return raw.filter((i) => transcript.includes(i.quote));
}
