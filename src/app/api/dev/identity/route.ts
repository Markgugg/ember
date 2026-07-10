import { NextResponse, type NextRequest } from "next/server";
import { ANON_COOKIE } from "@/lib/identity";

const PREV_COOKIE = "ember_anon_prev";

/**
 * Dev-only identity switcher, for walking through onboarding as a new person.
 *
 * `?action=reset` drops the anon cookie, so the proxy mints a fresh id on the
 * next request and the app sees a user with no profile. The old id is stashed
 * in a second cookie first, because that id still owns every transcript and
 * insight in the store: forgetting it would strand the data, not delete it.
 *
 * `?action=restore` puts the old id back. 404s in production.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("not found", { status: 404 });
  }

  const action = req.nextUrl.searchParams.get("action") ?? "reset";
  const current = req.cookies.get(ANON_COOKIE)?.value ?? null;
  const previous = req.cookies.get(PREV_COOKIE)?.value ?? null;

  if (action === "restore") {
    if (!previous) {
      return NextResponse.json(
        { error: "no previous identity stashed" },
        { status: 400 },
      );
    }
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.set(ANON_COOKIE, previous, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
    res.cookies.delete(PREV_COOKIE);
    return res;
  }

  if (action === "whoami") {
    return NextResponse.json({ current, previous });
  }

  // reset
  const res = NextResponse.redirect(new URL("/welcome", req.url));
  res.cookies.delete(ANON_COOKIE);
  // Only stash on the FIRST reset. Browsing after a reset mints a throwaway
  // id, so a second reset would overwrite the stash with that empty identity
  // and strand the real account for good.
  if (current && !previous) {
    res.cookies.set(PREV_COOKIE, current, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
  }
  return res;
}
