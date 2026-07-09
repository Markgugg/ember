"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface ToastOptions {
  message: string;
  tone?: "neutral" | "danger" | "caution";
  /** Undo affordance — shown as a button; toast auto-dismisses after `duration`. */
  onUndo?: () => void;
  /** ms, default 5000 */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(opts: ToastOptions) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    (opts: ToastOptions) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { ...opts, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), opts.duration ?? 5000),
      );
    },
    [dismiss],
  );

  const timersRef = timers;
  useEffect(() => {
    const map = timersRef.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, [timersRef]);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex animate-rise-in items-center gap-3 rounded-md border border-line-strong bg-overlay py-2 pl-4 pr-2 text-sm text-ink shadow-[var(--shadow-overlay)]"
          >
            {t.tone && t.tone !== "neutral" && (
              <span
                aria-hidden
                className={`size-1.5 rounded-full ${
                  t.tone === "danger" ? "bg-danger" : "bg-caution"
                }`}
              />
            )}
            <span>{t.message}</span>
            {t.onUndo ? (
              <button
                type="button"
                onClick={() => {
                  t.onUndo?.();
                  dismiss(t.id);
                }}
                className="rounded-sm px-2 py-1 text-xs font-medium text-ember transition-colors duration-[120ms] hover:bg-raised"
              >
                Undo
              </button>
            ) : (
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="rounded-sm px-2 py-1 text-xs text-ink-3 transition-colors duration-[120ms] hover:bg-raised hover:text-ink"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
