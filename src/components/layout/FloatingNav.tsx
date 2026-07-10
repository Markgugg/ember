"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useUiStore } from "@/stores/ui";

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
  const openSettings = useUiStore((s) => s.openSettings);

  const openComposer = () => {
    const next = new URLSearchParams(params.toString());
    next.set("compose", "news");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <header
      className="glass fixed left-1/2 top-[18px] z-20 flex w-[min(1120px,calc(100vw-48px))] -translate-x-1/2 items-center gap-[18px] rounded-[22px] py-[9px] pl-[18px] pr-3"
      style={{ backdropFilter: "blur(26px) saturate(1.7)" }}
    >
      <Link href="/" className="flex items-center gap-2">
        <CurrentMark />
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
          Current
        </span>
      </Link>

      <nav
        aria-label="Primary"
        className="flex gap-0.5 rounded-[14px] bg-[rgb(27_36_48/0.05)] p-[3px]"
      >
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-[11px] px-4 py-[7px] text-[12.5px] font-semibold transition-colors duration-200 ${
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

      <div className="flex-1" />

      <button
        type="button"
        onClick={openComposer}
        className="pill-primary px-5 py-[9px] text-[12.5px]"
      >
        Write a post
      </button>

      <button
        type="button"
        onClick={openSettings}
        aria-label="Voice and profile settings"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[rgb(27_36_48/0.85)] text-[11.5px] font-semibold text-white transition-transform duration-200 hover:scale-105"
      >
        {initials}
      </button>
    </header>
  );
}
