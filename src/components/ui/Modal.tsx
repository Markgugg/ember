"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog. */
  label: string;
  children: React.ReactNode;
}

/** Level-2 overlay: glass scrim, xl radius, Esc + scrim-click dismiss, focus containment. */
export function Modal({ open, onClose, label, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    // Move focus into the dialog.
    const id = requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLElement>(
          'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
        )
        ?.focus();
    });
    return () => {
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(id);
      restoreFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[rgb(27_36_48/0.28)] backdrop-blur-[10px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="glass relative w-full max-w-lg animate-spring-in rounded-[24px] p-7"
        style={{
          background: "rgb(255 255 255 / 0.86)",
          backdropFilter: "blur(44px) saturate(1.8)",
          boxShadow: "0 40px 90px rgb(31 45 65 / 0.3)",
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
