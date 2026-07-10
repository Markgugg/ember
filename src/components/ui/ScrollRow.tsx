"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * A horizontal rail you can actually traverse. The old row was
 * overflow-x-auto with the scrollbar hidden, which on a mouse means there was
 * no visible way to move it at all. Three affordances fix that:
 *
 *  - chevrons, shown only on the side that has more content
 *  - the mouse wheel scrolls the rail while the pointer is over it (native
 *    listener: React registers wheel as passive, so preventDefault would be
 *    ignored there)
 *  - edge fades that say "there's more" without saying anything
 */
export function ScrollRow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = () => {
    const el = railRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);

    const onWheel = (e: WheelEvent) => {
      // Only claim the gesture while the rail can still move that way;
      // at the ends the page scrolls normally.
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      const atStart = el.scrollLeft <= 0 && delta < 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && delta > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      el.scrollLeft += delta;
    };
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  const nudge = (direction: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={railRef}
        onScroll={update}
        className={`no-scrollbar flex snap-x snap-proximity gap-4 overflow-x-auto pb-1.5 ${className}`}
      >
        {children}
      </div>

      {canLeft && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[rgb(238_242_247/0.9)] to-transparent"
          />
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label="Scroll back"
            className="glass absolute left-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink transition-transform hover:scale-110"
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
        </>
      )}
      {canRight && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[rgb(238_242_247/0.9)] to-transparent"
          />
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label="Scroll forward"
            className="glass absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink transition-transform hover:scale-110"
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}
