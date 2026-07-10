import Link from "next/link";
import { getRepo } from "@/lib/db";
import { getUserId } from "@/lib/identity";
import { draftTitle } from "@/lib/view";
import { ComposeLink } from "@/components/composer/ComposeLink";
import { QueueDay } from "@/components/queue/QueueDay";

export const dynamic = "force-dynamic";

/**
 * The week. Planned slots are reminders — Current never posts on your behalf,
 * and the page says so rather than implying an automation that doesn't exist.
 */
export default async function QueuePage() {
  const repo = await getRepo();
  const userId = await getUserId();
  const drafts = await repo.listDrafts(userId);

  const unposted = drafts.filter((d) => d.status !== "posted");
  const shipped = drafts.filter((d) => d.status === "posted");

  const days = nextSevenDays();
  const planned = unposted.filter((d) => d.plannedFor);
  const unplanned = unposted.filter((d) => !d.plannedFor);

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
        <ComposeLink seg="news" className="pill-primary px-5 py-[9px] text-[12.5px]">
          + Draft a post
        </ComposeLink>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {days.map((day) => (
          <QueueDay
            key={day.iso}
            iso={day.iso}
            label={day.label}
            date={day.date}
            isToday={day.isToday}
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
            Current doesn&apos;t post for you. LinkedIn&apos;s API won&apos;t
            allow it without an approved app, and we&apos;d rather say so than
            pretend. A planned slot is a reminder: open it, copy, paste.
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
