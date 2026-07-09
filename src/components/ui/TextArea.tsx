"use client";

import { forwardRef, useCallback, type TextareaHTMLAttributes } from "react";

export interface TextAreaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Auto-grow to fit content (default true). */
  autoGrow?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea({ autoGrow = true, className = "", onInput, ...props }, ref) {
    const handleInput = useCallback(
      (e: Parameters<NonNullable<typeof onInput>>[0]) => {
        if (autoGrow) {
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = `${el.scrollHeight}px`;
        }
        onInput?.(e);
      },
      [autoGrow, onInput],
    );

    return (
      <textarea
        ref={ref}
        onInput={handleInput}
        className={
          "w-full resize-none rounded-lg border border-line bg-raised p-4 text-base text-ink " +
          "placeholder:text-ink-3 transition-colors duration-[120ms] " +
          "focus:border-line-strong focus:outline-none focus-visible:outline-2 " +
          `focus-visible:outline-ember focus-visible:outline-offset-2 ${className}`
        }
        {...props}
      />
    );
  },
);
