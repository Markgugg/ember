import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { getUserId } from "@/lib/identity";

export const runtime = "nodejs";

/**
 * Dev-only demo seed: marks the current visitor onboarded with a sample
 * profile so the dashboard can be exercised without the onboarding flow.
 * Hard-disabled in production.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not available" }, { status: 404 });
  }
  const repo = await getRepo();
  const userId = await getUserId();
  const profile = await repo.upsertProfile({
    id: userId,
    displayName: "Mark Guggenheim",
    headline:
      "CS student & co-founder — full-stack products with TypeScript and Next.js",
    audience: "founders and AI engineers",
    linkedinUrl: null,
    voiceSamples: [],
    onboardedAt: new Date().toISOString(),
    linkedinUrn: null,
    linkedinAccessToken: null,
    linkedinTokenExpiresAt: null,
  });
  return NextResponse.json({ ok: true, userId: profile.id });
}
