"use client";

import type { StreamLine } from "./useSessionStream";

/**
 * F8 — the product's signature screen. Serif lines appear as pipeline stages
 * truly complete; the active line carries the breathing ember dot; completed
 * lines dim so attention has exactly one home.
 */
export function ReasoningStream({
  lines,
  excerpt,
  active,
}: {
  lines: StreamLine[];
  /** 2-line quote of what's being reasoned about. */
  excerpt: string;
  active: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-[640px]">
      <blockquote className="mb-8 border-l-2 border-ember pl-3 text-sm text-ink-3">
        <p className="line-clamp-2">{excerpt}</p>
      </blockquote>

      <div aria-live="polite" className="flex flex-col gap-4">
        {lines.map((l, i) => {
          const isActive = active && i === lines.length - 1;
          return (
            <p
              key={i}
              className={`flex animate-rise-in items-start gap-3 font-serif text-lg transition-colors duration-200 ${
                isActive ? "text-ink" : "text-ink-2"
              } ${l.stage === "error" ? "text-danger" : ""} ${
                l.stage === "discourse_degraded" ? "text-caution" : ""
              }`}
            >
              {isActive && (
                <span
                  aria-hidden
                  className="mt-2.5 size-1.5 shrink-0 animate-ember-breathe rounded-full bg-ember"
                />
              )}
              <span className="sr-only">ember: </span>
              {l.line}
            </p>
          );
        })}
      </div>
    </div>
  );
}
