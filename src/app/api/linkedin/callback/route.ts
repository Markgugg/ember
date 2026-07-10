import { NextRequest, NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { getUserId } from "@/lib/identity";
import { exchangeCode, fetchMemberUrn } from "@/lib/linkedin";

export const runtime = "nodejs";

/** OAuth return leg: code → member token + URN, stored on the profile. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.cookies.get("linkedin_oauth_state")?.value;

  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(`/queue?linkedin=error&reason=${encodeURIComponent(reason)}`, url),
    );

  if (url.searchParams.get("error")) {
    return fail(url.searchParams.get("error_description") ?? "denied");
  }
  if (!code || !state || state !== expectedState) return fail("state mismatch");

  try {
    const redirectUri =
      process.env.LINKEDIN_REDIRECT_URI ?? `${url.origin}/api/linkedin/callback`;
    const { accessToken, expiresAt } = await exchangeCode(code, redirectUri);
    const urn = await fetchMemberUrn(accessToken);

    const repo = await getRepo();
    const userId = await getUserId();
    const existing = await repo.getProfile(userId);
    await repo.upsertProfile({
      id: userId,
      displayName: existing?.displayName ?? null,
      headline: existing?.headline ?? null,
      audience: existing?.audience ?? null,
      linkedinUrl: existing?.linkedinUrl ?? null,
      beats: existing?.beats ?? [],
      voiceSamples: existing?.voiceSamples ?? [],
      onboardedAt: existing?.onboardedAt ?? new Date().toISOString(),
      linkedinUrn: urn,
      linkedinAccessToken: accessToken,
      linkedinTokenExpiresAt: expiresAt,
    });

    const response = NextResponse.redirect(new URL("/queue?linkedin=connected", url));
    response.cookies.delete("linkedin_oauth_state");
    return response;
  } catch (err) {
    return fail(err instanceof Error ? err.message : "exchange failed");
  }
}
