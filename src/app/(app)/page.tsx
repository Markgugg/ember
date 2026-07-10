import Link from "next/link";
import { redirect } from "next/navigation";
import { getRepo } from "@/lib/db";
import { getUserId } from "@/lib/identity";
import { getConversations, getStories, draftTitle, formatAge } from "@/lib/view";
import { StoryCard, LiveBadge } from "@/components/news/StoryCard";
import { ComposeLink } from "@/components/composer/ComposeLink";

export const dynamic = "force-dynamic";

export default async function Home() {
  const userId = await getUserId();
  const repo = await getRepo();
  const profile = await repo.getProfile(userId);
  if (!profile?.onboardedAt) redirect("/welcome");

  const [{ stories, live, snapshotAgeHours }, conversations, drafts, insights] =
    await Promise.all([
      getStories(),
      getConversations(userId),
      repo.listDrafts(userId),
      repo.listInsights(userId),
    ]);

  const firstName = profile.displayName?.split(" ")[0] ?? "";
  const queued = drafts
    .filter((d) => d.status !== "posted")
    .sort((a, b) =>
      (a.plannedFor ?? "9999").localeCompare(b.plannedFor ?? "9999"),
    )
    .slice(0, 3);

  const shipped = drafts.filter((d) => d.status === "posted").length;
  const angles = insights.filter((i) => i.status !== "posted").length;

  return (
    <div className="mx-auto flex max-w-[1200px] animate-fade-up flex-col gap-[22px] px-8 pb-12 pt-[100px]">
      {/* greeting + real numbers */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-[27px] font-bold tracking-[-0.02em]">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}.
          </h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {longDate()} ·{" "}
            {queued.length > 0
              ? `${queued.length} post${queued.length === 1 ? "" : "s"} waiting in your queue`
              : "nothing queued — the feed is live below"}
          </p>
        </div>
        <div className="flex-1" />
        <div className="glass-soft flex items-stretch overflow-hidden rounded-[20px]">
          <Stat value={angles} label="Angles banked" />
          <Divider />
          <Stat value={drafts.length} label="Drafts written" />
          <Divider />
          <Stat value={shipped} label="Posts shipped" />
        </div>
      </div>

      {/* ── source 1: live AI news ─────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-baseline gap-2.5">
          <h2 className="text-[17px] font-bold tracking-[-0.01em]">
            Today in AI
          </h2>
          <LiveBadge live={live} />
          <span className="text-[12px] text-ink-3">
            {live
              ? `updated ${snapshotAgeHours !== null ? formatAge(snapshotAgeHours) : "just now"} ago`
              : "live feed unreachable — showing evergreen debates"}
          </span>
          <div className="flex-1" />
          <Link
            href="/news"
            className="text-[12.5px] font-semibold text-accent hover:underline"
          >
            See the full feed →
          </Link>
        </div>
        <div className="no-scrollbar flex gap-4 overflow-x-auto pb-1.5">
          {stories.slice(0, 6).map((s) => (
            <StoryCard key={s.id} story={s} width={280} />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
        {/* ── source 2: your conversations ─────────────────────── */}
        <section className="glass rounded-[20px] px-[22px] py-[18px]">
          <div className="mb-2.5 flex items-center">
            <span className="text-[15px] font-bold">Your voice</span>
            <span className="ml-2 text-[11.5px] text-ink-3">
              conversations become posts
            </span>
            <div className="flex-1" />
            <Link
              href="/transcripts"
              className="text-[12px] font-semibold text-accent hover:underline"
            >
              Open library →
            </Link>
          </div>

          {conversations.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-[rgb(27_36_48/0.18)] p-6 text-center">
              <p className="text-[13px] text-ink-2">
                No conversations yet. The news gives you the moment — a
                conversation gives you something to say about it.
              </p>
              <ComposeLink
                seg="transcript"
                className="mt-3 inline-flex pill-primary px-4 py-2 text-[12.5px]"
              >
                Add your first transcript
              </ComposeLink>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {conversations.slice(0, 3).map((c) => (
                <ComposeLink
                  key={c.id}
                  seg="transcript"
                  conversation={c.id}
                  className="glass-inner flex items-center gap-3 rounded-[14px] px-3.5 py-[11px] text-left transition-transform duration-200 hover:scale-[1.012] hover:shadow-[0_8px_20px_rgb(31_45_65/0.1)]"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[rgb(10_102_194/0.09)] text-[11px] font-bold text-accent">
                    {c.angles.length || "–"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">
                      {c.name}
                    </span>
                    <span className="block text-[11.5px] text-ink-3">
                      {c.meta}
                    </span>
                  </span>
                </ComposeLink>
              ))}
            </div>
          )}

          <div className="mt-3 flex gap-2.5">
            <ComposeLink
              seg="transcript"
              className="flex flex-1 items-center justify-center rounded-[12px] border border-dashed border-[rgb(27_36_48/0.16)] bg-[rgb(255_255_255/0.55)] py-2.5 text-[12px] font-semibold text-ink-2 transition-colors hover:bg-[rgb(255_255_255/0.8)] hover:text-ink"
            >
              Paste transcript
            </ComposeLink>
            <Link
              href="/transcripts"
              className="flex flex-1 items-center justify-center rounded-[12px] border border-dashed border-[rgb(27_36_48/0.16)] bg-[rgb(255_255_255/0.55)] py-2.5 text-[12px] font-semibold text-ink-2 transition-colors hover:bg-[rgb(255_255_255/0.8)] hover:text-ink"
            >
              Upload audio
            </Link>
          </div>
        </section>

        {/* ── the queue ─────────────────────────────────────────── */}
        <section className="glass rounded-[20px] px-[22px] py-[18px]">
          <div className="mb-2.5 flex items-baseline gap-2">
            <span className="text-[15px] font-bold">Queue</span>
            <span className="text-[11.5px] text-ink-3">
              {queued.length === 0
                ? "nothing waiting"
                : `${queued.length} ready to post`}
            </span>
            <div className="flex-1" />
            <Link
              href="/queue"
              className="text-[12px] font-semibold text-accent hover:underline"
            >
              Open queue →
            </Link>
          </div>

          <div className="flex flex-col gap-2">
            {queued.map((d) => (
              <Link
                key={d.id}
                href={`/brief/${d.briefId}`}
                className="glass-inner flex items-center gap-2.5 rounded-[13px] px-3 py-2.5"
              >
                <span className="shrink-0 rounded-full bg-[rgb(10_102_194/0.09)] px-2.5 py-[5px] text-[10.5px] font-bold text-accent">
                  {d.plannedFor ? slotLabel(d.plannedFor) : "READY"}
                </span>
                <span className="truncate text-[12.5px] font-semibold">
                  {draftTitle(d)}
                </span>
              </Link>
            ))}
            <ComposeLink
              seg="news"
              className="flex items-center justify-center rounded-[13px] border-[1.5px] border-dashed border-[rgb(27_36_48/0.18)] px-3 py-2.5 text-[12px] text-ink-3 transition-colors hover:bg-[rgb(255_255_255/0.5)]"
            >
              + Draft from today&apos;s news
            </ComposeLink>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="px-[26px] py-3.5">
      <div className="text-[25px] font-bold tracking-[-0.02em]">{value}</div>
      <div className="mt-px text-[11px] text-ink-2">{label}</div>
    </div>
  );
}

function Divider() {
  return <div aria-hidden className="w-px bg-[rgb(27_36_48/0.08)]" />;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function longDate(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function slotLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}
