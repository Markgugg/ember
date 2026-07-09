import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";
import { serverEnv } from "@/lib/env";

export const SONNET = "claude-sonnet-5";
export const HAIKU = "claude-haiku-4-5-20251001";

let _client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!_client) {
    if (!serverEnv.anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY missing — should be in fixture mode");
    }
    _client = new Anthropic({ apiKey: serverEnv.anthropicApiKey });
  }
  return _client;
}

export interface StructuredCallOptions<T> {
  model: string;
  /** Static prefix — kept stable for Anthropic prompt caching. */
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  /** JSON Schema for the tool input (the structured output shape). */
  inputSchema: Record<string, unknown>;
  /** Runtime validator for the same shape. */
  validator: ZodType<T>;
  maxTokens?: number;
}

/**
 * Tool-forced structured output with zod validation and one retry on
 * mismatch. Every structured AI call in the app goes through here.
 */
export async function structuredCall<T>(opts: StructuredCallOptions<T>): Promise<T> {
  const attempt = async (extraNudge?: string): Promise<T> => {
    const response = await anthropic().messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2048,
      system: [
        {
          type: "text" as const,
          text: opts.system,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      messages: [
        {
          role: "user",
          content: extraNudge ? `${opts.user}\n\n${extraNudge}` : opts.user,
        },
      ],
      tools: [
        {
          name: opts.toolName,
          description: opts.toolDescription,
          input_schema: opts.inputSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: opts.toolName },
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (!toolUse) throw new Error(`No tool_use block from ${opts.toolName}`);
    return opts.validator.parse(toolUse.input);
  };

  try {
    return await attempt();
  } catch (firstError) {
    // one retry, telling the model what was wrong
    return attempt(
      `Your previous output failed validation (${String(firstError).slice(0, 300)}). Follow the tool schema exactly.`,
    );
  }
}
