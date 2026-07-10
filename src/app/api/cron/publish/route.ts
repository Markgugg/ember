import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { publishDue } from "@/lib/publish";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * The queue's clock: publishes due planned drafts for users with LinkedIn
 * connected. Wired to Vercel Cron (see vercel.json); callable manually in dev.
 * Users without a connection are skipped — their slots stay reminders.
 */
export async function GET(request: NextRequest) {
  if (serverEnv.cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${serverEnv.cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const result = await publishDue();
  return NextResponse.json(result);
}
