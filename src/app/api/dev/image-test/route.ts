import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { getUserId } from "@/lib/identity";
import { fetchArticlePreview, fetchImageBytes } from "@/lib/preview";

/**
 * Dev-only: exercise the article-image pipeline without publishing anything.
 *
 * `upload=1` also registers the asset with LinkedIn. That creates no post and
 * nothing visible on the profile; an unattached asset is invisible. It is the
 * only way to prove the upload half works short of publishing for real.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("not found", { status: 404 });
  }
  const { url, upload, userId: asUser } = (await req.json()) as {
    url: string;
    upload?: boolean;
    /** Target a specific profile: curl has no session cookie. */
    userId?: string;
  };

  const preview = await fetchArticlePreview(url);
  if (!preview.fetched || !preview.image) {
    return NextResponse.json({
      step: "preview",
      fetched: preview.fetched,
      image: preview.image,
      verdict: "no image available -> post falls back to a link card",
    });
  }

  const image = await fetchImageBytes(preview.image);
  if (!image) {
    return NextResponse.json({
      step: "download",
      imageUrl: preview.image,
      verdict: "image refused or wrong type -> falls back to a link card",
    });
  }

  const result: Record<string, unknown> = {
    step: "download",
    imageUrl: preview.image,
    contentType: image.contentType,
    bytes: image.bytes.length,
    kb: Math.round(image.bytes.length / 1024),
  };

  if (upload) {
    const repo = await getRepo();
    const profile = await repo.getProfile(asUser ?? (await getUserId()));
    const { linkedinReady, uploadImage } = await import("@/lib/linkedin");
    if (!linkedinReady(profile)) {
      result.upload = "skipped: linkedin not connected for this identity";
      return NextResponse.json(result);
    }
    try {
      const asset = await uploadImage(profile!, image.bytes, image.contentType);
      result.step = "upload";
      result.asset = asset;
      result.verdict = "asset registered and uploaded; nothing posted";
    } catch (err) {
      result.uploadError = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json(result);
}
