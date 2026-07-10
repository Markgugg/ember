"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Opens the composer sheet as URL state — shareable, refresh-safe, back-button-safe. */
export function ComposeLink({
  seg = "news",
  story,
  conversation,
  insight,
  className = "",
  children,
}: {
  seg?: "news" | "transcript" | "both";
  story?: string;
  conversation?: string;
  insight?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = new URLSearchParams({ compose: seg });
  if (story) params.set("story", story);
  if (conversation) params.set("conversation", conversation);
  if (insight) params.set("insight", insight);

  return (
    <Link
      href={`${pathname}?${params.toString()}`}
      scroll={false}
      className={className}
    >
      {children}
    </Link>
  );
}
