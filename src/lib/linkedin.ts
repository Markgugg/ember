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

/** The source a post was written against, attached as a link preview. */
export interface PostLink {
  url: string;
  title?: string | null;
  description?: string | null;
  /**
   * The article's own image, passed straight to LinkedIn as the card's
   * thumbnail. We supply it rather than letting LinkedIn crawl for it: the
   * crawler is 403'd by openai.com and, as we found the hard way, produces an
   * imageless card for anthropic.com too even when the page serves og:image
   * to everyone else. Supplying it makes the card's picture our decision.
   */
  imageUrl?: string | null;
}

/**
 * Upload an image and get back its asset URN.
 *
 * Needed because LinkedIn builds a link card by crawling the URL itself, and
 * Cloudflare-fronted publishers (openai.com among them) return 403 to
 * LinkedInBot. The card then renders as a bare title-and-domain box with no
 * image. Supplying the image directly is the only way to control what the
 * post looks like.
 *
 * Two steps, per the Assets API: register the upload to get a one-time URL,
 * then PUT the bytes to it.
 */
export async function uploadImage(
  profile: Profile,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  if (!linkedinReady(profile)) {
    throw new Error("linkedin not connected or token expired");
  }

  const registerRes = await fetch(
    "https://api.linkedin.com/v2/assets?action=registerUpload",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${profile.linkedinAccessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: profile.linkedinUrn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!registerRes.ok) {
    const body = await registerRes.text().catch(() => "");
    throw new Error(
      `linkedin registerUpload failed (${registerRes.status}): ${body.slice(0, 160)}`,
    );
  }

  const registered = (await registerRes.json()) as {
    value?: {
      asset?: string;
      uploadMechanism?: Record<
        string,
        { uploadUrl?: string }
      >;
    };
  };
  const asset = registered.value?.asset;
  const mechanism =
    registered.value?.uploadMechanism?.[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ];
  const uploadUrl = mechanism?.uploadUrl;
  if (!asset || !uploadUrl) throw new Error("linkedin registerUpload: no upload url");

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${profile.linkedinAccessToken}`,
      "Content-Type": contentType,
    },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(30_000),
  });
  if (!uploadRes.ok) {
    throw new Error(`linkedin image upload failed (${uploadRes.status})`);
  }

  return asset;
}

/**
 * Publish a post as the member. Returns the LinkedIn post id.
 *
 * An ARTICLE share is one card carrying the picture, the headline, the domain,
 * and the link, all clickable. That is strictly better than an IMAGE share,
 * which takes the media slot and leaves the URL as bare text in the body.
 *
 * The catch is the picture. LinkedIn fills the card by crawling the page, and
 * that crawl fails often enough to matter: openai.com 403s LinkedInBot
 * outright, and anthropic.com serves og:image to everyone yet still produced
 * an imageless card. So we hand LinkedIn the thumbnail. Its API rejects an
 * uploaded asset alongside originalUrl (400), but accepts a thumbnail URL.
 *
 * Nothing here invents an image. The picture is the article's own, or absent.
 */
export async function postToLinkedIn(
  profile: Profile,
  text: string,
  link?: PostLink | null,
  /**
   * A pre-uploaded asset URN switches the share to a full-width IMAGE post —
   * the "photo" style. LinkedIn rejects an asset combined with originalUrl
   * (400), so in this mode the caller puts the link in the body instead.
   */
  imageAsset?: string | null,
): Promise<string> {
  if (!linkedinReady(profile)) {
    throw new Error("linkedin not connected or token expired");
  }

  const shareContent: Record<string, unknown> = {
    shareCommentary: { text },
    shareMediaCategory: imageAsset ? "IMAGE" : link ? "ARTICLE" : "NONE",
  };

  if (imageAsset) {
    shareContent.media = [
      {
        status: "READY",
        media: imageAsset,
        ...(link?.title ? { title: { text: link.title.slice(0, 180) } } : {}),
      },
    ];
  } else if (link) {
    shareContent.media = [
      {
        status: "READY",
        originalUrl: link.url,
        ...(link.title ? { title: { text: link.title.slice(0, 180) } } : {}),
        ...(link.description
          ? { description: { text: link.description.slice(0, 250) } }
          : {}),
        ...(link.imageUrl ? { thumbnails: [{ url: link.imageUrl }] } : {}),
      },
    ];
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
      specificContent: { "com.linkedin.ugc.ShareContent": shareContent },
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
