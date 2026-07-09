import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { MEMORY_DB, serverEnv } from "@/lib/env";

const ANON_COOKIE = "ember_anon";

/**
 * Resolve the acting user id for a request.
 *
 * - Supabase configured + signed in  → auth user id
 * - otherwise                        → anon cookie id (created on demand)
 *
 * Anonymous work is claimed onto the auth identity at sign-in (F1),
 * so the anon id is a full first-class user everywhere else in the app.
 */
export async function getUserId(): Promise<string> {
  if (!MEMORY_DB) {
    const authed = await getAuthUserId();
    if (authed) return authed;
  }
  return getAnonId();
}

/** The signed-in Supabase user id, or null. */
export async function getAuthUserId(): Promise<string | null> {
  if (MEMORY_DB || !serverEnv.supabaseUrl || !serverEnv.supabaseAnonKey) {
    return null;
  }
  const { createServerClient } = await import("@supabase/ssr");
  const cookieStore = await cookies();
  const supabase = createServerClient(
    serverEnv.supabaseUrl,
    serverEnv.supabaseAnonKey,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {
          /* read-only in RSC context; middleware handles refresh */
        },
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Anonymous identity via httpOnly cookie. Created on first use. */
export async function getAnonId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(ANON_COOKIE)?.value;
  if (existing) return existing;
  const id = randomUUID();
  try {
    cookieStore.set(ANON_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  } catch {
    // cookies() is read-only inside Server Components — the id still
    // identifies this request; middleware sets the durable cookie.
  }
  return id;
}

export { ANON_COOKIE };
