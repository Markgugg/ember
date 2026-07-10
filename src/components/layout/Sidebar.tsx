"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Radio,
  Library,
  WandSparkles,
  SlidersHorizontal,
} from "lucide-react";
import { useUiStore } from "@/stores/ui";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pulse", label: "AI Pulse", icon: Radio },
  { href: "/library", label: "Library", icon: Library },
] as const;

/** Taplio-style fixed sidebar: brand, primary CTA, nav, settings at the foot. */
export function Sidebar() {
  const pathname = usePathname();
  const openSettings = useUiStore((s) => s.openSettings);

  return (
    <aside className="sticky top-0 flex h-screen w-[232px] shrink-0 flex-col border-r border-line bg-raised">
      <div className="px-5 pb-2 pt-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-ember font-serif text-base text-white">
            e
          </span>
          <span className="font-serif text-lg text-ink">ember</span>
        </Link>
      </div>

      <div className="px-4 py-3">
        <Link
          href="/compose"
          className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-ember text-sm font-medium text-white shadow-sm transition-colors duration-[120ms] hover:bg-ember-hover"
        >
          <WandSparkles size={15} aria-hidden />
          Write a Post
        </Link>
      </div>

      <nav aria-label="Primary" className="flex flex-col gap-0.5 px-3 pt-2">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-[120ms] ${
                active
                  ? "bg-accent-soft font-medium text-ember"
                  : "text-ink-2 hover:bg-accent-softer hover:text-ink"
              }`}
            >
              <Icon size={16} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-line p-3">
        <button
          type="button"
          onClick={openSettings}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-ink-2 transition-colors duration-[120ms] hover:bg-accent-softer hover:text-ink"
        >
          <SlidersHorizontal size={16} aria-hidden />
          Voice &amp; profile
        </button>
      </div>
    </aside>
  );
}
