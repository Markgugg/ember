import { NextResponse } from "next/server";
import { fetchArticlePreview } from "@/lib/preview";

/** Dev-only: exercise the OG preview fetcher and its SSRF guard. 404s in prod. */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("not found", { status: 404 });
  }
  const { urls } = (await req.json()) as { urls: string[] };
  const out = [];
  for (const url of urls) {
    const p = await fetchArticlePreview(url);
    out.push({
      url,
      fetched: p.fetched,
      title: p.title?.slice(0, 60) ?? null,
      hasImage: Boolean(p.image),
      hasDescription: Boolean(p.description),
      siteName: p.siteName,
    });
  }
  return NextResponse.json(out);
}
