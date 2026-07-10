import { NextResponse } from "next/server";
import {
  fetchArticlePreview,
  linkedinCanRenderCard,
} from "@/lib/preview";

/** Dev-only: which post shape each URL resolves to. 404s in production. */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("not found", { status: 404 });
  }
  const { urls } = (await req.json()) as { urls: string[] };
  const out = [];
  for (const url of urls) {
    const canCard = await linkedinCanRenderCard(url);
    let shape: "card" | "image" | "plain" = "plain";
    let ourImage: string | null = null;
    if (canCard) {
      shape = "card";
    } else {
      const p = await fetchArticlePreview(url);
      ourImage = p.image;
      shape = p.fetched && p.image ? "image" : "plain";
    }
    out.push({ url, linkedinCanCrawl: canCard, shape, ourImage: Boolean(ourImage) });
  }
  return NextResponse.json(out);
}
