"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const base =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium " +
  "transition-[background-color,color,opacity] duration-[120ms] " +
  "disabled:pointer-events-none disabled:opacity-40 select-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-ember text-white shadow-sm hover:bg-ember-hover active:opacity-90",
  ghost:
    "text-ink-2 border border-transparent hover:border-line hover:bg-accent-softer hover:text-ink active:bg-accent-soft",
  danger: "text-danger hover:bg-accent-softer active:bg-accent-soft",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ variant = "primary", className = "", ...props }, ref) {
    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${className}`}
        {...props}
      />
    );
  },
);
