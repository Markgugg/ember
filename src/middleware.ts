import { NextResponse, type NextRequest } from "next/server";

const ANON_COOKIE = "ember_anon";

/**
 * Two jobs:
 * 1. Guarantee every visitor has a durable anon identity cookie
 *    (RSCs can read but not set cookies — this is where it gets set).
 * 2. Keep the Supabase auth session fresh when Supabase is configured.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    const { createServerClient } = await import("@supabase/ssr");
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });
    // Touching getUser() refreshes an expiring token via the setAll above.
    await supabase.auth.getUser();
  }

  if (!request.cookies.get(ANON_COOKIE)) {
    response.cookies.set(ANON_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }

  return response;
}

export const config = {
  // Everything except static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp|ico)).*)"],
};
