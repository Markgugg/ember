import Link from "next/link";
import { getRepo } from "@/lib/db";
import { getUserId } from "@/lib/identity";
import { draftTitle } from "@/lib/view";
import type { Draft } from "@/lib/types";
import { linkedinConfigured, linkedinReady } from "@/lib/linkedin";
import { ComposeLink } from "@/components/composer/ComposeLink";
import { QueueDay } from "@/components/queue/QueueDay";

export const dynamic = "force-dynamic";

/**
 * The week. With LinkedIn connected, due slots publish automatically through
 * the official API; without it, a slot is a reminder — and the page says
 * which one is true right now.
 */
export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ linkedin?: string; reason?: string }>;
}) {
  const repo = await getRepo();
  const userId = await getUserId();
  const [drafts, profile, params] = await Promise.all([
    repo.listDrafts(userId),
    repo.getProfile(userId),
    searchParams,
  ]);
  const connected = linkedinReady(profile);
  const configured = linkedinConfigured();

  const unposted = drafts.filter((d) => d.status !== "posted");
  const shipped = drafts.filter((d) => d.status === "posted");

  const days = nextSevenDays();
  const planned = unposted.filter((d) => d.plannedFor);
  const unplanned = readyToPost(drafts);

  return (
    <div className="mx-auto flex max-w-[1200px] animate-fade-up flex-col gap-[18px] px-8 pb-12 pt-[100px]">
      <div className="flex flex-wrap items-end gap-3.5">
        <div>
          <h1 className="text-[27px] font-bold tracking-[-0.02em]">This week</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {planned.length} planned · {unplanned.length} ready to post ·{" "}
            {shipped.length} shipped
          </p>
        </div>
        <div className="flex-1" />
        {connected ? (
          <span className="flex items-center gap-2 rounded-full border border-[rgb(23_114_69/0.25)] bg-[rgb(23_114_69/0.08)] px-4 py-2 text-[12px] font-semibold text-positive">
            <span aria-hidden className="size-1.5 rounded-full bg-positive" />
            LinkedIn connected — due slots post automatically
          </span>
        ) : configured ? (
          <a
            href="/api/linkedin/connect"
            className="flex items-center gap-2 rounded-full border border-[rgb(10_102_194/0.3)] bg-white px-4 py-2 text-[12px] font-semibold text-accent shadow-sm transition-transform hover:scale-[1.03]"
          >
            <span aria-hidden className="size-1.5 rounded-full bg-accent" />
            Connect LinkedIn
          </a>
        ) : null}
        <ComposeLink seg="news" className="pill-primary px-5 py-[9px] text-[12.5px]">
          + Draft a post
        </ComposeLink>
      </div>

      {params.linkedin === "connected" && (
        <p className="rounded-[14px] border border-[rgb(23_114_69/0.25)] bg-[rgb(23_114_69/0.07)] px-4 py-3 text-[12.5px] font-medium text-positive">
          LinkedIn connected. Drafts you plan will post at their slot; you can
          also post any draft immediately from its page.
        </p>
      )}
      {params.linkedin === "error" && (
        <p className="rounded-[14px] border border-[rgb(180_35_24/0.25)] bg-[rgb(180_35_24/0.06)] px-4 py-3 text-[12.5px] font-medium text-danger">
          LinkedIn connection failed
          {params.reason ? `: ${params.reason}` : ""}. Try again.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {days.map((day, i) => (
          <QueueDay
            key={day.iso}
            iso={day.iso}
            label={day.label}
            date={day.date}
            isToday={day.isToday}
            suggest={i === 1 || i === 4}
            posts={planned
              .filter((d) => sameDay(d.plannedFor!, day.iso))
              .map((d) => ({
                id: d.id,
                briefId: d.briefId,
                time: timeLabel(d.plannedFor!),
                title: draftTitle(d),
                angle: d.angle,
              }))}
          />
        ))}
      </div>

      {/* ready but unplanned */}
      <section className="glass-soft rounded-[18px] px-5 py-4">
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="text-[13px] font-bold">Ready to post</h2>
          <span className="text-[12px] text-ink-3">
            drafts with no slot yet — open one to plan it
          </span>
        </div>
        {unplanned.length === 0 ? (
          <p className="text-[12px] leading-relaxed text-ink-2">
            Nothing waiting. Draft from{" "}
            <Link href="/news" className="font-semibold text-accent hover:underline">
              today&apos;s news
            </Link>{" "}
            or{" "}
            <Link
              href="/transcripts"
              className="font-semibold text-accent hover:underline"
            >
              a conversation
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {unplanned.map((d) => (
              <Link
                key={d.id}
                href={`/brief/${d.briefId}`}
                className="glass-inner flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition-transform duration-200 hover:scale-[1.005]"
              >
                <span className="shrink-0 rounded-full bg-[rgb(10_102_194/0.09)] px-2.5 py-[5px] text-[10px] font-bold uppercase text-accent">
                  {d.angle}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                  {draftTitle(d)}
                </span>
                <span className="shrink-0 text-[11px] text-ink-3">
                  {new Date(d.createdAt).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-col gap-4 md:flex-row">
        <section className="glass-soft flex-1 rounded-[18px] px-5 py-4">
          <h2 className="text-[13px] font-bold">How posting works</h2>
          <p className="mt-1 text-[12px] leading-[1.55] text-ink-2">
            {connected ? (
              <>
                You&apos;re connected through LinkedIn&apos;s official Share
                API. Planned slots publish automatically when they come due,
                and every draft has a &quot;Post now&quot;. Current only posts
                what you explicitly drafted and planned — never on its own.
              </>
            ) : configured ? (
              <>
                Connect LinkedIn above and planned slots publish automatically
                through the official Share API. Until then, a slot is a
                reminder: open it, copy, paste.
              </>
            ) : (
              <>
                Posting uses LinkedIn&apos;s official Share API — no
                session-hijacking extension. It needs a free LinkedIn developer
                app: see the README&apos;s &quot;Posting to LinkedIn&quot;
                section (~5 minutes). Until then, a slot is a reminder.
              </>
            )}
          </p>
        </section>
        <section className="glass-soft flex-1 rounded-[18px] px-5 py-4">
          <h2 className="text-[13px] font-bold">Consistency</h2>
          <p className="mt-1 text-[12px] leading-[1.55] text-ink-2">
            {shipped.length === 0
              ? "No posts shipped yet. The first one is the hard one."
              : `${shipped.length} post${shipped.length === 1 ? "" : "s"} shipped. `}
            {unplanned.length > 0 && (
              <>
                You have {unplanned.length} draft
                {unplanned.length === 1 ? "" : "s"} ready — give{" "}
                {unplanned.length === 1 ? "it" : "one"} a slot.
              </>
            )}
          </p>
        </section>
      </div>
    </div>
  );
}

/**
 * One row per brief, not one per angle.
 *
 * Every session writes three drafts so you can compare angles, but the queue
 * is a list of posts you intend to publish. Showing all three made a single
 * idea look like three pieces of work, and once you planned one, its two
 * siblings still sat here as if they were still waiting.
 *
 * So: a brief with any planned or posted draft is done and disappears from
 * this list. Otherwise it contributes exactly one row — the angle Current
 * recommended. The others stay reachable through "Other angles" on the brief.
 */
function readyToPost(drafts: Draft[]): Draft[] {
  const spokenFor = new Set(
    drafts
      .filter((d) => d.plannedFor || d.status === "posted")
      .map((d) => d.briefId),
  );

  const byBrief = new Map<string, Draft>();
  for (const draft of drafts) {
    if (spokenFor.has(draft.briefId)) continue;
    if (draft.status === "posted" || draft.plannedFor) continue;
    const held = byBrief.get(draft.briefId);
    if (!held || (draft.isPrimary && !held.isPrimary)) {
      byBrief.set(draft.briefId, draft);
    }
  }
  return [...byBrief.values()];
}

/* ── date helpers ─────────────────────────────────────────────────── */

function nextSevenDays() {
  const out: { iso: string; label: string; date: string; isToday: boolean }[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    out.push({
      iso: d.toISOString(),
      label: d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase(),
      date: String(d.getDate()),
      isToday: i === 0,
    });
  }
  return out;
}

function sameDay(isoA: string, isoB: string): boolean {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
