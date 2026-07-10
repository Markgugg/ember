"use client";

import type { StreamLine } from "./useSessionStream";

/**
 * The reasoning stream. Serif lines appear as pipeline stages truly complete;
 * the active line carries the pulsing dot, finished lines dim so attention has
 * exactly one home. The wait is the demo.
 */
export function ReasoningStream({
  lines,
  excerpt,
  active,
}: {
  lines: StreamLine[];
  excerpt: string;
  active: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-[640px]">
      <blockquote className="mb-8 border-l-2 border-accent pl-3 text-[13px] text-ink-3">
        <p className="line-clamp-2">{excerpt}</p>
      </blockquote>

      <div aria-live="polite" className="flex flex-col gap-4">
        {lines
          .filter((l) => l.stage !== "done")
          .map((l, i, arr) => {
            const isActive = active && i === arr.length - 1;
            return (
              <p
                key={i}
                className={`flex animate-fade-up items-start gap-3 font-serif text-lg transition-colors duration-200 ${
                  isActive ? "text-ink" : "text-ink-2"
                } ${l.stage === "error" ? "text-danger" : ""} ${
                  l.stage === "discourse_fallback" ? "text-caution" : ""
                }`}
              >
                {isActive && (
                  <span
                    aria-hidden
                    className="mt-2.5 size-1.5 shrink-0 animate-pulse-dot rounded-full bg-accent"
                  />
                )}
                <span className="sr-only">Current: </span>
                {l.line}
              </p>
            );
          })}
      </div>
    </div>
  );
}
