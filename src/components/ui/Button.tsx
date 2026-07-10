"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const base =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-[13px] font-semibold " +
  "transition-[background-color,color,opacity,transform,box-shadow] duration-200 " +
  "disabled:pointer-events-none disabled:opacity-45 select-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:scale-[1.03] hover:shadow-[0_10px_26px_rgb(10_102_194/0.35)]",
  ghost:
    "bg-[rgb(27_36_48/0.06)] text-ink hover:bg-[rgb(27_36_48/0.12)]",
  danger: "text-danger hover:bg-[rgb(180_35_24/0.08)]",
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
