import { getStories, formatAge } from "@/lib/view";
import { StoryCard, LiveBadge } from "@/components/news/StoryCard";

export const dynamic = "force-dynamic";

/**
 * Source 1 — what the AI world is arguing about, right now.
 * Pulled live from Hacker News at request time; clustered into tensions
 * when an Anthropic key is present.
 */
export default async function NewsPage() {
  const { stories, live, snapshotAgeHours } = await getStories();

  return (
    <div className="mx-auto flex max-w-[1200px] animate-fade-up flex-col gap-[18px] px-8 pb-12 pt-[100px]">
      <div className="flex flex-wrap items-end gap-3.5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[27px] font-bold tracking-[-0.02em]">
              Today in AI
            </h1>
            <LiveBadge live={live} />
          </div>
          <p className="mt-1 text-[13px] text-ink-2">
            {live
              ? `Pulled from Hacker News · refreshed ${snapshotAgeHours !== null ? `${formatAge(snapshotAgeHours)} ago` : "just now"} · click any story to draft`
              : "Live feed unreachable — showing the debates that never die"}
          </p>
        </div>
        <div className="flex-1" />
        <div className="flex flex-wrap gap-1.5">
          <Beat active>All</Beat>
          <Beat>Hot</Beat>
        </div>
      </div>

      {stories.length === 0 ? (
        <div className="glass rounded-[20px] p-12 text-center">
          <p className="text-[14px] text-ink-2">
            No AI stories surfaced on this pull. The feed refreshes every few
            minutes — try again shortly.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {stories.map((s) => (
            <StoryCard key={s.id} story={s} showExcerpt />
          ))}
        </div>
      )}

      <p className="mt-2 text-center text-[11.5px] text-ink-3">
        Current never writes from a story alone. Pick one and it looks for the
        claim you already hold about it — or tells you it found none.
      </p>
    </div>
  );
}

function Beat({
  children,
  active = false,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <span
      className={`rounded-full px-[15px] py-[7px] text-[12px] font-semibold ${
        active
          ? "border border-[rgb(10_102_194/0.3)] bg-[rgb(10_102_194/0.09)] text-accent"
          : "border border-[rgb(27_36_48/0.08)] bg-[rgb(255_255_255/0.6)] text-ink-2"
      }`}
    >
      {children}
    </span>
  );
}
