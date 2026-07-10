import "server-only";
import type { Profile } from "@/lib/types";

/**
 * LinkedIn publishing via the OFFICIAL API — no browser-extension session
 * hijacking. Two self-serve products on a LinkedIn developer app make this
 * work: "Sign In with LinkedIn using OpenID Connect" (identity) and
 * "Share on LinkedIn" (w_member_social — post as the authenticated member).
 *
 * Flow: /api/linkedin/connect → LinkedIn consent → /api/linkedin/callback
 * (code → 60-day member token + URN, stored on the profile) → posts go out
 * through postToLinkedIn, either "Post now" or when a queue slot comes due.
 */

export const LINKEDIN_SCOPES = "openid profile w_member_social";

export function linkedinConfigured(): boolean {
  return Boolean(
    process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET,
  );
}

export function linkedinAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: LINKEDIN_SCOPES,
    state,
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; expiresAt: string }> {
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  });
  if (!res.ok) {
    throw new Error(`linkedin token exchange failed (${res.status})`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  };
}

export interface MemberIdentity {
  /** Author URN for posting. */
  urn: string;
  /** Verified from LinkedIn — not scraped, not guessed. */
  name: string | null;
}

/**
 * OpenID Connect userinfo: the member's stable id and real name.
 * Note the ceiling — `openid profile` does NOT return headline, About, or
 * posts. Those need LinkedIn Partner Program approval, so Current asks the
 * member to paste them rather than pretending to know.
 */
export async function fetchMemberIdentity(
  accessToken: string,
): Promise<MemberIdentity> {
  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`linkedin userinfo failed (${res.status})`);
  const json = (await res.json()) as {
    sub: string;
    name?: string;
    given_name?: string;
    family_name?: string;
  };
  const name =
    json.name ??
    [json.given_name, json.family_name].filter(Boolean).join(" ") ??
    null;
  return { urn: `urn:li:person:${json.sub}`, name: name || null };
}

export function linkedinReady(profile: Profile | null): boolean {
  return Boolean(
    profile?.linkedinAccessToken &&
      profile.linkedinUrn &&
      (!profile.linkedinTokenExpiresAt ||
        new Date(profile.linkedinTokenExpiresAt).getTime() > Date.now()),
  );
}

/** Publish a text post as the member. Returns the LinkedIn post id. */
export async function postToLinkedIn(
  profile: Profile,
  text: string,
): Promise<string> {
  if (!linkedinReady(profile)) {
    throw new Error("linkedin not connected or token expired");
  }
  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${profile.linkedinAccessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: profile.linkedinUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "NONE",
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`linkedin post failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.headers.get("x-restli-id") ?? "posted";
}
