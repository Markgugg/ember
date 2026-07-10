/**
 * Server-side environment access. Import only from server code.
 *
 * Fixture mode: when EMBER_FIXTURES=1 (or required AI keys are absent),
 * every AI/service call is served from recorded fixtures so the full app
 * runs locally with zero credentials. See lib/ai/fixtures.ts.
 */

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export const serverEnv = {
  anthropicApiKey: optional("ANTHROPIC_API_KEY"),
  openaiApiKey: optional("OPENAI_API_KEY"),
  supabaseUrl: optional("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: optional("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),
  cronSecret: optional("CRON_SECRET"),
  discourseFeeds: (
    optional("DISCOURSE_FEEDS") ??
    "https://hnrss.org/frontpage,https://www.anthropic.com/rss.xml"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

/**
 * True when the *language* work (mining, judging, drafting) is served from
 * heuristics instead of Claude. Only the Anthropic key gates this — Current
 * runs fully on Anthropic alone.
 */
export const FIXTURE_MODE =
  process.env.EMBER_FIXTURES === "1" || !serverEnv.anthropicApiKey;

/**
 * True when embeddings come from the local bag-of-words vectorizer rather than
 * OpenAI. Matching still works (worse), so an OpenAI key is optional — it also
 * unlocks Whisper for the mic and audio uploads.
 */
export const LOCAL_EMBEDDINGS =
  process.env.EMBER_FIXTURES === "1" || !serverEnv.openaiApiKey;

/** True when no Supabase project is configured — persistence falls back to the in-memory dev store. */
export const MEMORY_DB =
  process.env.EMBER_MEMORY_DB === "1" ||
  !serverEnv.supabaseUrl ||
  !serverEnv.supabaseAnonKey;
