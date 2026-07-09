"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface StreamLine {
  stage: string;
  line: string;
}

export interface SessionRequest {
  transcriptText?: string;
  source?: "voice" | "paste" | "upload";
  insightId?: string;
  topicHint?: string;
}

/**
 * F8 client — POST /api/session, consume SSE, surface lines as they land.
 * On `done`, navigates to the brief. On `error`, exposes retry state.
 */
export function useSessionStream() {
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
            const event = JSON.parse(data) as StreamLine & { briefId?: string };
            if (event.stage === "done" && event.briefId) {
              router.push(`/brief/${event.briefId}`);
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
        // stream closed without done/error
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
    [router],
  );

  return { lines, streaming, failed, run, cancel };
}
