"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUiStore } from "@/stores/ui";

export function TopBar() {
  const pathname = usePathname();
  const openSettings = useUiStore((s) => s.openSettings);

  // Onboarding owns its own chrome-free canvas.
  if (pathname === "/welcome") return null;

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-line bg-base/70 backdrop-blur-md">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-full max-w-[960px] items-center justify-between px-6"
      >
        <Link
          href="/"
          className="font-serif text-lg text-ink transition-opacity duration-[120ms] hover:opacity-80"
        >
          ember
        </Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openSettings}
            className="rounded-md px-3 py-1.5 text-sm text-ink-2 transition-colors duration-[120ms] hover:bg-raised hover:text-ink"
          >
            Voice
          </button>
        </div>
      </nav>
    </header>
  );
}
