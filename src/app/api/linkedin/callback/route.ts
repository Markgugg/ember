import { NextRequest, NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { getUserId } from "@/lib/identity";
import { exchangeCode, fetchMemberIdentity } from "@/lib/linkedin";

export const runtime = "nodejs";

/**
 * OAuth return leg: code → member token + URN + verified name, stored on the
 * profile. Lands back wherever the connect route was launched from.
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
    const existing = await repo.getProfile(userId);
    await repo.upsertProfile({
      id: userId,
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

    const response = NextResponse.redirect(
      new URL(`${next}?linkedin=connected`, url),
    );
    response.cookies.delete("linkedin_oauth_state");
    response.cookies.delete("linkedin_oauth_next");
    return response;
  } catch (err) {
    return fail(err instanceof Error ? err.message : "exchange failed");
  }
}
