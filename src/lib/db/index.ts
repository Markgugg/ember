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
  if (MEMORY_DB) return memoryRepo;
  const { supabaseRepo } = await import("./supabase");
  return supabaseRepo;
}

export type { Repo } from "./repo";
