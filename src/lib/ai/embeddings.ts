import "server-only";
import OpenAI from "openai";
import { LOCAL_EMBEDDINGS, serverEnv } from "@/lib/env";
import { pseudoEmbedding } from "./fixtures";

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) {
    if (!serverEnv.openaiApiKey) {
      throw new Error("OPENAI_API_KEY missing — should be in fixture mode");
    }
    _openai = new OpenAI({ apiKey: serverEnv.openaiApiKey });
  }
  return _openai;
}

/** Process-lifetime content-hash cache — never re-embed identical text. */
const cache = new Map<string, number[]>();

export async function embed(text: string): Promise<number[]> {
  const [v] = await embedBatch([text]);
  return v;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (LOCAL_EMBEDDINGS) return texts.map(pseudoEmbedding);

  const missing = texts.filter((t) => !cache.has(t));
  if (missing.length > 0) {
    const res = await openai().embeddings.create({
      model: "text-embedding-3-small",
      input: missing,
    });
    res.data.forEach((d, i) => cache.set(missing[i], d.embedding));
  }
  return texts.map((t) => cache.get(t)!);
}
