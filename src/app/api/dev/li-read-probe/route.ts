import { NextResponse } from "next/server";
import { getRepo } from "@/lib/db";
import { linkedinReady } from "@/lib/linkedin";

/**
 * Dev-only: what can our token READ?
 *
 * Posting works with the self-serve "Share on LinkedIn" product
 * (w_member_social). Reading — listing your posts, or a post's likes and
 * comments — is documented as needing r_member_social, which LinkedIn only
 * grants through its partner programs. This route asks the live API instead
 * of trusting the docs, because the docs have been wrong for us before.
 *
 * Never prints the token. 404s in production.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("not found", { status: 404 });
  }
  const { userId, postUrn, deleteUrn } = (await req.json()) as {
    userId: string;
    /** Optional: a specific post to probe socialActions on. */
    postUrn?: string;
    /** Optional: delete a probe post (w_member_social covers deleting own shares). */
    deleteUrn?: string;
  };

  const repo = await getRepo();
  const profile = await repo.getProfile(userId);
  if (!linkedinReady(profile)) {
    return NextResponse.json({ error: "linkedin not connected" }, { status: 400 });
  }

  const headers = {
    Authorization: `Bearer ${profile!.linkedinAccessToken}`,
    "X-Restli-Protocol-Version": "2.0.0",
  };
  const results: Record<string, unknown>[] = [];

  if (deleteUrn) {
    const res = await fetch(
      `https://api.linkedin.com/v2/ugcPosts/${encodeURIComponent(deleteUrn)}`,
      { method: "DELETE", headers, signal: AbortSignal.timeout(10_000) },
    );
    results.push({ label: `delete ${deleteUrn}`, status: res.status });
    return NextResponse.json({ results });
  }

  const probe = async (label: string, url: string) => {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
      const body = await res.text().catch(() => "");
      results.push({ label, status: res.status, body: body.slice(0, 400) });
      return { ok: res.ok, body };
    } catch (err) {
      results.push({ label, error: String(err) });
      return { ok: false, body: "" };
    }
  };

  // 1. List our own posts (documented permission: r_member_social).
  const encodedAuthor = encodeURIComponent(profile!.linkedinUrn!);
  const listed = await probe(
    "list own ugcPosts",
    `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(${encodedAuthor})&count=5`,
  );

  // 2. Social actions summary on a post (documented: r_member_social).
  let urn = postUrn ?? null;
  if (!urn && listed.ok) {
    try {
      const parsed = JSON.parse(listed.body) as { elements?: { id?: string }[] };
      urn = parsed.elements?.[0]?.id ?? null;
    } catch {
      /* body shape surprised us; the raw slice is in results already */
    }
  }
  if (urn) {
    await probe(
      "socialActions summary",
      `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(urn)}`,
    );
  } else {
    results.push({ label: "socialActions summary", skipped: "no post urn to probe" });
  }

  return NextResponse.json({ results });
}
