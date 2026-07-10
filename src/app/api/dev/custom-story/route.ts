import { NextResponse } from "next/server";
import { addCustomStory, loadStoryPreview } from "@/app/actions";
import { getRepo } from "@/lib/db";

/**
 * Dev-only: exercise the bring-your-own-article chain end to end.
 * add → stored → board untouched → preview pane loads. 404s in production.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("not found", { status: 404 });
  }
  const { url } = (await req.json()) as { url: string };

  const repo = await getRepo();
  const boardBefore = (await repo.latestSnapshot()).map((i) => i.id);

  const story = await addCustomStory(url);
  const boardAfter = (await repo.latestSnapshot()).map((i) => i.id);
  const preview = await loadStoryPreview(story.id);

  return NextResponse.json({
    story,
    boardUnchanged:
      boardBefore.length === boardAfter.length &&
      !boardAfter.includes(story.id),
    previewLoaded: Boolean(preview),
    previewArticle: preview?.article
      ? { title: preview.article.title, hasImage: Boolean(preview.article.image) }
      : null,
  });
}
