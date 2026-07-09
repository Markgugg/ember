"use client";

import type { ButtonHTMLAttributes, HTMLAttributes } from "react";

/** Static label chip. */
export function Chip({
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border border-line bg-raised px-2 py-0.5 text-xs text-ink-2 ${className}`}
      {...props}
    />
  );
}

/** Interactive chip (e.g. sample-transcript trigger, dismissible theme). */
export function ActionChip({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={
        "inline-flex items-center gap-1.5 rounded-sm border border-line bg-raised px-2.5 py-1 text-xs text-ink-2 " +
        "transition-colors duration-[120ms] hover:border-line-strong hover:text-ink " +
        className
      }
      {...props}
    />
  );
}
