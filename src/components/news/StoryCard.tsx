"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, MessagesSquare } from "lucide-react";
import type { StoryView } from "@/lib/view";

/**
 * A story from the live AI feed.
 *
 * Two destinations, kept distinct: the article being discussed, and the thread
 * discussing it. The card can't be one big <button> any more, because a button
 * may not contain links — so drafting is its own control and the source is
 * reachable without drafting first.
 *
 * The mockup drops a scraped article image in the plate; we render a favicon on
 * the domain's own hue instead. Nothing invented, nothing broken.
 */
export function StoryCard({
  story,
  width,
  showExcerpt = false,
}: {
  story: StoryView;
  /** Fixed px width inside the home gallery; fluid on the News grid. */
  width?: number;
  showExcerpt?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const draft = () =>
    router.push(`${pathname}?compose=news&story=${story.id}`, { scroll: false });

  // Self-posts have no outbound article: the thread IS the source.
  const readUrl = story.articleUrl ?? story.discussionUrl;

  return (
    <div
      style={width ? { width, flex: "none" } : undefined}
      className="glass glass-lift group flex flex-col rounded-[20px] p-2.5 pb-3.5 text-left"
    >
      <a
        href={readUrl}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={`Read: ${story.title}`}
        className="relative block rounded-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <SourcePlate story={story} />
      </a>

      <div className="px-2 pt-2.5">
        <div className="text-[10.5px] font-semibold text-ink-2">
          {story.kicker}
        </div>

        <a
          href={readUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-1.5 block text-[14px] font-semibold leading-[1.35] tracking-[-0.01em] hover:text-accent hover:underline decoration-1 underline-offset-2"
        >
          {story.title}
        </a>

        {showExcerpt && (
          <p className="mt-1.5 line-clamp-2 text-[12px] leading-[1.5] text-ink-2">
            {story.stanceA ? `${story.stanceA} vs ${story.stanceB}` : story.summary}
          </p>
        )}

        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={draft}
            className="pill-tinted px-3.5 py-1.5 text-[11.5px] transition-transform hover:scale-[1.03]"
          >
            Draft from this
          </button>

          <div className="ml-auto flex items-center gap-2.5">
            {story.articleUrl && (
              <a
                href={story.discussionUrl}
                target="_blank"
                rel="noreferrer noopener"
                title="Read the discussion on Hacker News"
                className="flex items-center gap-1 text-[11px] text-ink-4 transition-colors hover:text-accent"
              >
                <MessagesSquare size={12} aria-hidden />
                {story.buzz || "discussion"}
              </a>
            )}
            {!story.articleUrl && story.buzz && (
              <a
                href={story.discussionUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-1 text-[11px] text-ink-4 transition-colors hover:text-accent"
              >
                <MessagesSquare size={12} aria-hidden />
                {story.buzz}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The image slot: favicon + monogram on the domain's stable hue. */
function SourcePlate({ story }: { story: StoryView }) {
  return (
    <div
      className="relative flex h-[150px] items-center justify-center overflow-hidden rounded-[13px]"
      style={{
        background: `linear-gradient(145deg, hsl(${story.hue} 42% 92%), hsl(${(story.hue + 40) % 360} 46% 85%))`,
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.35]"
        style={{
          background:
            "radial-gradient(circle at 30% 25%, rgb(255 255 255 / 0.9), transparent 60%)",
        }}
      />
      <div className="relative flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(story.domain)}&sz=64`}
          alt=""
          width={26}
          height={26}
          className="rounded-[7px] shadow-sm"
        />
        <span
          className="text-[11px] font-bold uppercase tracking-[0.12em]"
          style={{ color: `hsl(${story.hue} 40% 30%)` }}
        >
          {story.domain.replace(/^www\./, "")}
        </span>
      </div>

      {story.velocity > 0.6 && (
        <span className="absolute right-2.5 top-2.5 rounded-full bg-white/85 px-2 py-0.5 text-[9.5px] font-bold tracking-wide text-accent">
          HOT
        </span>
      )}

      {/* Only appears on hover: the card's primary action is still drafting. */}
      <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-ink opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
        Read <ArrowUpRight size={11} aria-hidden />
      </span>
    </div>
  );
}

/** The pulsing LIVE badge used above every feed. */
export function LiveBadge({ live }: { live: boolean }) {
  if (!live) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-bold text-caution">
        <span aria-hidden className="size-1.5 rounded-full bg-caution" />
        FALLBACK
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-bold text-accent">
      <span
        aria-hidden
        className="size-1.5 animate-pulse-dot rounded-full bg-accent"
      />
      LIVE
    </span>
  );
}
