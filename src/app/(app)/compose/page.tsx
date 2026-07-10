"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import { ActionChip } from "@/components/ui/Chip";
import { AiLine } from "@/components/ui/AiVoice";
import { Recorder } from "@/components/session/Recorder";
import { ReasoningStream } from "@/components/session/ReasoningStream";
import { useSessionStream } from "@/components/session/useSessionStream";
import { SAMPLE_TRANSCRIPT } from "@/lib/sample";

const MIN_WORDS = 150;

export default function ComposePage() {
  return (
    <Suspense>
      <Composer />
    </Suspense>
  );
}

function Composer() {
  const params = useSearchParams();
  const insightId = params.get("insight");
  const topicHint = params.get("topic") ?? undefined;

  const [text, setText] = useState("");
  const [source, setSource] = useState<"voice" | "paste" | "upload">("paste");
  const [notice, setNotice] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { lines, streaming, failed, run, cancel } = useSessionStream();

  // Idea/library path: an existing insight arrives via ?insight= — no transcript needed.
  const autoRan = useRef(false);
  useEffect(() => {
    if (insightId && !autoRan.current) {
      autoRan.current = true;
      void run({ insightId, topicHint });
    }
  }, [insightId, topicHint, run]);

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const canSubmit = wordCount > 0 && !streaming;

  const submit = useCallback(() => {
    if (!canSubmit) return;
    setNotice(null);
    void run({ transcriptText: text, source, topicHint });
  }, [canSubmit, run, text, source, topicHint]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submit();
      } else if (e.key === "Escape" && (streaming || failed)) {
        cancel();
      } else if (
        e.key === "/" &&
        !streaming &&
        document.activeElement?.tagName !== "TEXTAREA" &&
        document.activeElement?.tagName !== "INPUT"
      ) {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit, streaming, failed, cancel]);

  const onUpload = useCallback(async (file: File) => {
    if (!/\.(txt|vtt)$/i.test(file.name)) {
      setNotice("Couldn't read that file — .txt and .vtt work.");
      return;
    }
    setText(await file.text());
    setSource("upload");
    setNotice(null);
  }, []);

  /* ── streaming state ────────────────────────────────────────────── */
  if (streaming || failed || insightId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-8 py-16">
        <div className="card-surface w-full max-w-[680px] p-8">
          <ReasoningStream
            lines={lines}
            excerpt={text || "Starting from something you already said…"}
            active={streaming}
          />
          {failed && (
            <div className="mt-8 flex gap-3">
              <Button
                onClick={() =>
                  insightId
                    ? void run({ insightId, topicHint })
                    : void run({ transcriptText: text, source, topicHint })
                }
              >
                Try again
              </Button>
              <Button variant="ghost" onClick={cancel}>
                Back
              </Button>
            </div>
          )}
        </div>
        {streaming && (
          <button
            type="button"
            onClick={cancel}
            className="mt-6 text-xs text-ink-3 transition-colors duration-[120ms] hover:text-ink-2"
          >
            esc to cancel
          </button>
        )}
      </div>
    );
  }

  /* ── input state ────────────────────────────────────────────────── */
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col px-8 pb-16 pt-14">
      <AiLine size="xl" className="mb-2">
        What&apos;s on your mind?
      </AiLine>
      <p className="mb-8 text-sm text-ink-2">
        Ember mines your actual claims, checks them against what the AI world
        is arguing about right now, and writes the post where they meet.
        {topicHint && (
          <span className="mt-1 block text-ember">Aiming at: “{topicHint}”</span>
        )}
      </p>

      <div className="card-surface p-5">
        <div className="mb-4 flex items-center gap-4">
          <Recorder
            onTranscript={(t) => {
              setText(t);
              setSource("voice");
            }}
            onUnavailable={(reason) => setNotice(reason)}
            disabled={streaming}
          />
          <span className="text-sm text-ink-3">talk it out, or paste below</span>
        </div>

        <TextArea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (source !== "voice") setSource("paste");
          }}
          placeholder="Paste a transcript, or just brain-dump."
          className="min-h-[190px] border-line bg-base"
          aria-label="Your thinking"
        />

        {notice && (
          <p className="mt-2 flex items-center gap-2 font-serif text-sm text-ink-2">
            <span aria-hidden className="size-1.5 rounded-full bg-caution" />
            {notice}
          </p>
        )}
        {wordCount > 0 && wordCount < MIN_WORDS && (
          <p className="mt-2 font-serif text-sm text-ink-2">
            <span
              aria-hidden
              className="mr-2 inline-block size-1.5 rounded-full bg-caution"
            />
            That&apos;s about twenty seconds of thinking. Give me two minutes —
            ramble is fine.
          </p>
        )}

        <div className="mt-4 flex items-center justify-between">
          {text.length === 0 ? (
            <ActionChip
              onClick={() => {
                setText(SAMPLE_TRANSCRIPT);
                setSource("paste");
              }}
            >
              Try it with a sample transcript →
            </ActionChip>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.vtt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
                e.target.value = "";
              }}
            />
            <Button variant="ghost" onClick={() => fileRef.current?.click()}>
              <FileUp size={16} aria-hidden />
              Upload .txt / .vtt
            </Button>
            <Button onClick={submit} disabled={!canSubmit}>
              Find the post
            </Button>
          </div>
        </div>
      </div>

      <p className="mt-3 text-right text-xs text-ink-3">⌘⏎ to submit</p>
    </div>
  );
}
