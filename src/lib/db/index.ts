import "server-only";
import { MEMORY_DB } from "@/lib/env";
import type { Repo } from "./repo";
import { memoryRepo } from "./memory";

/**
 * The app's single data access point. Supabase when configured,
 * in-memory store otherwise (credential-free dev / fixture mode).
 * The supabase impl is imported lazily so a keyless environment
 * never constructs the client.
 */
export async function getRepo(): Promise<Repo> {
  if (MEMORY_DB) {
    // On serverless the memory repo silently loses every write between
    // requests — refuse to run there unless explicitly opted in.
    if (process.env.VERCEL && process.env.EMBER_MEMORY_DB !== "1") {
      throw new Error(
        "Persistence is not configured: set NEXT_PUBLIC_SUPABASE_URL, " +
          "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in " +
          "Vercel and redeploy (or set EMBER_MEMORY_DB=1 to accept data loss).",
      );
    }
    return memoryRepo;
  }
  const { supabaseRepo } = await import("./supabase");
  return supabaseRepo;
}

export type { Repo } from "./repo";
