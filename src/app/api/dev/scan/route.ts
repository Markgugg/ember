import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Dev-only: exercise the onboarding scan without a browser.
 *   GET /api/dev/scan?url=https://www.linkedin.com/in/you
 *   POST { url, pastedProfileText } — the paste-to-redraft path
 * 404s in production.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not available" }, { status: 404 });
  }
  const url = request.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });
  const { scanLinkedin } = await import("@/lib/scan");
  return NextResponse.json(await scanLinkedin(url));
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not available" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    url?: string;
    pastedProfileText?: string;
  };
  if (!body.url) return NextResponse.json({ error: "url required" }, { status: 400 });
  const { scanLinkedin } = await import("@/lib/scan");
  return NextResponse.json(await scanLinkedin(body.url, body.pastedProfileText));
}
