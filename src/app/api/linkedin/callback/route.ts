import { NextRequest, NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { ANON_COOKIE, getUserId } from "@/lib/identity";
import { exchangeCode, fetchMemberIdentity } from "@/lib/linkedin";

export const runtime = "nodejs";

/**
 * OAuth return leg: code → member token + URN + verified name, stored on the
 * profile. Lands back wherever the connect route was launched from.
 *
 * Also the sign-back-in path: the URN is a stable per-member id, so if an
 * account already owns it, this browser adopts that account instead of
 * starting a fresh workspace — new device or cleared cookies, your data
 * comes back. Whatever the fresh anon id banked first is claimed across.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.cookies.get("linkedin_oauth_state")?.value;
  const next = request.cookies.get("linkedin_oauth_next")?.value ?? "/queue";

  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(
        `${next}?linkedin=error&reason=${encodeURIComponent(reason)}`,
        url,
      ),
    );

  if (url.searchParams.get("error")) {
    return fail(url.searchParams.get("error_description") ?? "denied");
  }
  if (!code || !state || state !== expectedState) return fail("state mismatch");

  try {
    const redirectUri =
      process.env.LINKEDIN_REDIRECT_URI ?? `${url.origin}/api/linkedin/callback`;
    const { accessToken, expiresAt } = await exchangeCode(code, redirectUri);
    const identity = await fetchMemberIdentity(accessToken);

    const repo = await getRepo();
    const userId = await getUserId();

    // Sign back in: another id already owns this LinkedIn member → that
    // account is this person. Claim whatever the fresh id banked (usually
    // nothing), then act as the owner from here on.
    const owner = await repo.findUserIdByLinkedinUrn(identity.urn);
    const accountId = owner && owner !== userId ? owner : userId;
    if (accountId !== userId) {
      await repo.claimUserData(userId, accountId);
    }

    const existing = await repo.getProfile(accountId);
    await repo.upsertProfile({
      id: accountId,
      // A verified name from LinkedIn beats anything we guessed from the URL.
      displayName: identity.name ?? existing?.displayName ?? null,
      headline: existing?.headline ?? null,
      audience: existing?.audience ?? null,
      linkedinUrl: existing?.linkedinUrl ?? null,
      beats: existing?.beats ?? [],
      voiceSamples: existing?.voiceSamples ?? [],
      // Connecting mid-onboarding must not skip the review step.
      onboardedAt: existing?.onboardedAt ?? null,
      linkedinUrn: identity.urn,
      linkedinAccessToken: accessToken,
      linkedinTokenExpiresAt: expiresAt,
    });

    // A restored account that finished onboarding skips the welcome tour.
    const dest =
      existing?.onboardedAt && next.startsWith("/welcome") ? "/" : next;
    const response = NextResponse.redirect(
      new URL(`${dest}?linkedin=connected`, url),
    );
    if (accountId !== userId) {
      response.cookies.set(ANON_COOKIE, accountId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      });
    }
    response.cookies.delete("linkedin_oauth_state");
    response.cookies.delete("linkedin_oauth_next");
    return response;
  } catch (err) {
    return fail(err instanceof Error ? err.message : "exchange failed");
  }
}
