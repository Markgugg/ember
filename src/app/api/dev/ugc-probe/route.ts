import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { fetchArticlePreview, fetchImageBytes } from "@/lib/preview";
import { linkedinReady } from "@/lib/linkedin";

/**
 * Dev-only: does LinkedIn accept an ARTICLE share that carries BOTH an
 * uploaded image asset and an originalUrl? If it does, a post can have the
 * picture and the embedded link card at once.
 *
 * Posts with lifecycleState DRAFT, so nothing reaches the feed. 404s in prod.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("not found", { status: 404 });
  }
  const { url, userId, publish } = (await req.json()) as {
    url: string;
    userId: string;
    publish?: boolean;
  };

  const repo = await getRepo();
  const profile = await repo.getProfile(userId);
  if (!linkedinReady(profile)) {
    return NextResponse.json({ error: "linkedin not connected" }, { status: 400 });
  }

  const preview = await fetchArticlePreview(url);
  if (!preview.image) {
    return NextResponse.json({ error: "no og:image on that url" }, { status: 400 });
  }
  const image = await fetchImageBytes(preview.image);
  if (!image) {
    return NextResponse.json({ error: "image download failed" }, { status: 400 });
  }

  const attempts: Record<string, unknown>[] = [];

  const tryPost = async (label: string, shareContent: Record<string, unknown>) => {
    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${profile!.linkedinAccessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: profile!.linkedinUrn,
        lifecycleState: publish ? "PUBLISHED" : "DRAFT",
        specificContent: { "com.linkedin.ugc.ShareContent": shareContent },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }),
    });
    const body = await res.text().catch(() => "");
    attempts.push({
      label,
      status: res.status,
      ok: res.ok,
      id: res.headers.get("x-restli-id"),
      body: res.ok ? undefined : body.slice(0, 300),
    });
    return res.ok;
  };

  // Exactly the payload postToLinkedIn now builds.
  await tryPost("ARTICLE + thumbnails[url] + title + description", {
    shareCommentary: { text: "probe: article card with our thumbnail" },
    shareMediaCategory: "ARTICLE",
    media: [
      {
        status: "READY",
        originalUrl: url,
        title: { text: (preview.title ?? "Article").slice(0, 180) },
        ...(preview.description
          ? { description: { text: preview.description.slice(0, 250) } }
          : {}),
        thumbnails: [{ url: preview.image }],
      },
    ],
  });

  return NextResponse.json({
    lifecycleState: publish ? "PUBLISHED" : "DRAFT",
    thumbnail: preview.image,
    attempts,
  });
}
