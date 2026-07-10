import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { refreshSnapshot } from "@/lib/discourse";

/** Dev-only: force a live news pull now, ignoring the TTL. 404s in production. */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("not found", { status: 404 });
  }
  const repo = await getRepo();
  const { items, live } = await refreshSnapshot(repo);
  return NextResponse.json({
    live,
    count: items.length,
    items: items.map((i) => ({
      title: i.title,
      velocity: Number(i.velocity.toFixed(3)),
      domain: i.sources[0]?.domain ?? null,
      articleUrl: i.sources[0]?.articleUrl ?? null,
      threadUrl: i.sources[0]?.url ?? null,
    })),
  });
}
