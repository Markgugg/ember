"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface StreamLine {
  stage: string;
  line: string;
  briefId?: string;
}

export interface SessionRequest {
  transcriptText?: string;
  source?: "voice" | "paste" | "upload";
  transcriptId?: string;
  insightId?: string;
  discourseItemId?: string;
  topicHint?: string;
}

export interface StreamOptions {
  /** Push to /brief/:id on completion. False when a sheet renders the draft inline. */
  navigateOnDone?: boolean;
}

/**
 * POST /api/session and consume the SSE reasoning stream. Lines land as each
 * pipeline stage truly completes; the terminal `done` event carries the brief id.
 */
export function useSessionStream({ navigateOnDone = true }: StreamOptions = {}) {
  const [lines, setLines] = useState<StreamLine[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [failed, setFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setLines([]);
    setFailed(false);
  }, []);

  const run = useCallback(
    async (request: SessionRequest) => {
      setLines([]);
      setFailed(false);
      setStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`session ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const raw of events) {
            const data = raw.replace(/^data: /, "").trim();
            if (!data) continue;
            const event = JSON.parse(data) as StreamLine;
            if (event.stage === "done" && event.briefId) {
              if (navigateOnDone) {
                router.push(`/brief/${event.briefId}`);
                return;
              }
              setLines((l) => [...l, event]);
              setStreaming(false);
              return;
            }
            if (event.stage === "error") {
              setLines((l) => [...l, event]);
              setFailed(true);
              setStreaming(false);
              return;
            }
            setLines((l) => [...l, event]);
          }
        }
        setFailed(true);
        setStreaming(false);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setLines((l) => [
          ...l,
          { stage: "error", line: "I lost the thread. Your words are safe — try again?" },
        ]);
        setFailed(true);
        setStreaming(false);
      }
    },
    [router, navigateOnDone],
  );

  return { lines, streaming, failed, run, cancel };
}
