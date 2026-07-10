"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, MessagesSquare } from "lucide-react";
import { loadStoryPreview, type StoryPreview } from "@/app/actions";

/**
 * The right pane before a draft exists: what the selected story actually says.
 *
 * The article can't be iframed — nearly every publisher sends X-Frame-Options:
 * DENY, so an embed renders an empty box. Instead we show its Open Graph card,
 * which is the same data LinkedIn fetches when it builds the preview on your
 * post. So this doubles as a rehearsal of what you're about to publish.
 */
export function StoryPreviewPane({ storyId }: { storyId: string }) {
  const [preview, setPreview] = useState<StoryPreview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadStoryPreview(storyId)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-3 overflow-hidden rounded-2xl border border-[rgb(27_36_48/0.08)] bg-[rgb(255_255_255/0.65)] p-5">
        <div className="h-[150px] w-full animate-pulse rounded-xl bg-[rgb(27_36_48/0.06)]" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-[rgb(27_36_48/0.06)]" />
        <div className="h-3 w-full animate-pulse rounded bg-[rgb(27_36_48/0.05)]" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-[rgb(27_36_48/0.05)]" />
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-2xl border border-[rgb(27_36_48/0.08)] bg-[rgb(255_255_255/0.65)]">
        <p className="px-10 text-center text-[13px] text-ink-3">
          Couldn&apos;t load that story.
        </p>
      </div>
    );
  }

  const { article } = preview;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-2xl border border-[rgb(27_36_48/0.08)] bg-[rgb(255_255_255/0.65)]">
      {article?.image && (
        <a
          href={article.url}
          target="_blank"
          rel="noreferrer noopener"
          className="group relative block shrink-0 overflow-hidden rounded-t-2xl"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.image}
            alt=""
            className="h-[170px] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[10.5px] font-semibold text-ink shadow-sm">
            Open <ArrowUpRight size={11} aria-hidden />
          </span>
        </a>
      )}

      <div className="flex flex-col gap-3.5 p-5">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
            The argument
          </p>
          <h3 className="mt-1 text-[15px] font-bold leading-[1.35] tracking-[-0.01em]">
            {preview.title}
          </h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
            {preview.summary}
          </p>
        </div>

        {preview.stanceA && preview.stanceB && (
          <div className="grid grid-cols-2 gap-2">
            <Stance label="One side" text={preview.stanceA} />
            <Stance label="The other" text={preview.stanceB} />
          </div>
        )}

        <div className="h-px bg-[rgb(27_36_48/0.08)]" />

        {article ? (
          <div>
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
              The source
            </p>
            <a
              href={article.url}
              target="_blank"
              rel="noreferrer noopener"
              className="block rounded-[12px] border border-[rgb(27_36_48/0.1)] bg-white p-3 transition-colors hover:border-accent"
            >
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(article.domain)}&sz=32`}
                  alt=""
                  width={14}
                  height={14}
                  className="rounded-[3px]"
                />
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
                  {article.siteName ?? article.domain}
                </span>
              </div>

              {article.fetched && article.title ? (
                <>
                  <p className="mt-1.5 text-[13px] font-semibold leading-snug text-ink">
                    {article.title}
                  </p>
                  {article.description && (
                    <p className="mt-1 line-clamp-3 text-[12px] leading-relaxed text-ink-2">
                      {article.description}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">
                  {article.domain} wouldn&apos;t serve me a preview, so I
                  can&apos;t show what it says. Open it to read it.
                </p>
              )}

              <span className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent">
                Read the article <ArrowUpRight size={12} aria-hidden />
              </span>
            </a>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-3">
              {article.fetched && article.image
                ? "Your post carries this card: image, headline and link."
                : article.fetched
                  ? "No image on this page, so the card carries no picture."
                  : "This site blocks preview requests, so the card may come out plain."}
            </p>
          </div>
        ) : (
          <p className="text-[12px] leading-relaxed text-ink-3">
            No outbound article. The Hacker News thread is the source.
          </p>
        )}

        <a
          href={preview.discussionUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-1.5 text-[11.5px] text-ink-2 transition-colors hover:text-accent"
        >
          <MessagesSquare size={13} aria-hidden />
          {preview.buzz ? `Read ${preview.buzz}` : "Read the discussion"} on
          Hacker News
        </a>
      </div>
    </div>
  );
}

function Stance({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-[12px] border border-[rgb(27_36_48/0.08)] bg-white/70 p-2.5">
      <p className="text-[9.5px] font-bold uppercase tracking-wide text-ink-3">
        {label}
      </p>
      <p className="mt-1 text-[11.5px] leading-snug text-ink-2">{text}</p>
    </div>
  );
}
