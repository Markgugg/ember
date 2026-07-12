"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ProfileMenu } from "@/components/layout/ProfileMenu";

const tabs = [
  { href: "/", label: "Home" },
  { href: "/news", label: "News" },
  { href: "/transcripts", label: "Transcripts" },
  { href: "/queue", label: "Queue" },
] as const;

/** The Current mark: a thick LinkedIn-blue ring. */
export function CurrentMark({ size = 22 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="block shrink-0 rounded-full border-accent"
      style={{
        width: size,
        height: size,
        borderWidth: Math.max(3, Math.round(size * 0.227)),
      }}
    />
  );
}

export function FloatingNav({ initials }: { initials: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();

  const openComposer = () => {
    const next = new URLSearchParams(params.toString());
    next.set("compose", "news");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <header
      className="glass fixed left-1/2 top-[18px] z-20 flex w-[min(1120px,calc(100vw-24px))] -translate-x-1/2 items-center gap-2 rounded-[22px] py-[9px] pl-[14px] pr-2 sm:w-[min(1120px,calc(100vw-48px))] sm:gap-[18px] sm:pl-[18px] sm:pr-3"
      style={{ backdropFilter: "blur(26px) saturate(1.7)" }}
    >
      <Link href="/" className="flex shrink-0 items-center gap-2">
        <CurrentMark />
        {/* The ring alone carries the brand once space is tight. */}
        <span className="hidden text-[15px] font-semibold tracking-[-0.01em] text-ink sm:block">
          Current
        </span>
      </Link>

      {/* Four tabs don't fit a phone beside the logo, the button and the
          avatar — so the tab strip itself scrolls rather than squeezing the
          rest of the bar off-screen. */}
      <nav
        aria-label="Primary"
        className="no-scrollbar flex min-w-0 flex-1 gap-0.5 overflow-x-auto rounded-[14px] bg-[rgb(27_36_48/0.05)] p-[3px] sm:flex-none"
      >
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-[11px] px-3 py-[7px] text-[12.5px] font-semibold transition-colors duration-200 sm:px-4 ${
                active
                  ? "bg-[rgb(255_255_255/0.95)] text-ink shadow-[0_2px_8px_rgb(31_45_65/0.1)]"
                  : "text-ink-2 hover:bg-[rgb(255_255_255/0.6)]"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="hidden flex-1 sm:block" />

      <button
        type="button"
        onClick={openComposer}
        className="pill-primary shrink-0 px-3 py-[9px] text-[12.5px] sm:px-5"
      >
        <span className="sm:hidden">Write</span>
        <span className="hidden sm:inline">Write a post</span>
      </button>

      <ProfileMenu initials={initials} />
    </header>
  );
}
