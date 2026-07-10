import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { linkedinAuthUrl, linkedinConfigured } from "@/lib/linkedin";

export const runtime = "nodejs";

/** Kick off the LinkedIn OAuth consent flow. */
export function GET(request: NextRequest) {
  if (!linkedinConfigured()) {
    return NextResponse.json(
      {
        error:
          "LinkedIn app not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET — see README → 'Posting to LinkedIn'.",
      },
      { status: 501 },
    );
  }
  const redirectUri =
    process.env.LINKEDIN_REDIRECT_URI ??
    `${request.nextUrl.origin}/api/linkedin/callback`;
  const state = randomUUID();

  const response = NextResponse.redirect(linkedinAuthUrl(redirectUri, state));
  const cookie = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  };
  response.cookies.set("linkedin_oauth_state", state, cookie);
  // Where to land afterwards — onboarding sends ?next=/welcome.
  const next = request.nextUrl.searchParams.get("next");
  if (next?.startsWith("/")) {
    response.cookies.set("linkedin_oauth_next", next, cookie);
  }
  return response;
}
