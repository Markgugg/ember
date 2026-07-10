"use client";

import { usePathname, useRouter } from "next/navigation";
import type { StoryView } from "@/lib/view";

/**
 * A story from the live AI feed. The mockup drops a scraped article image
 * here; we render a deterministic source plate instead — a real favicon on
 * the domain's own hue. Nothing invented, nothing broken.
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

  return (
    <button
      type="button"
      onClick={draft}
      style={width ? { width, flex: "none" } : undefined}
      className="glass glass-lift flex flex-col rounded-[20px] p-2.5 pb-3.5 text-left"
    >
      <SourcePlate story={story} />
      <div className="px-2 pt-2.5">
        <div className="text-[10.5px] font-semibold text-ink-2">
          {story.kicker}
        </div>
        <div className="mt-1.5 text-[14px] font-semibold leading-[1.35] tracking-[-0.01em]">
          {story.title}
        </div>
        {showExcerpt && (
          <p className="mt-1.5 line-clamp-2 text-[12px] leading-[1.5] text-ink-2">
            {story.stanceA ? `${story.stanceA} vs ${story.stanceB}` : story.summary}
          </p>
        )}
        <div className="mt-2.5 flex items-center">
          <span className="pill-tinted px-3.5 py-1.5 text-[11.5px]">
            Draft from this
          </span>
          {story.buzz && (
            <span className="ml-auto text-[11px] text-ink-4">{story.buzz}</span>
          )}
        </div>
      </div>
    </button>
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
