"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import { ActionChip } from "@/components/ui/Chip";
import { AiLine } from "@/components/ui/AiVoice";
import { Recorder } from "@/components/session/Recorder";
import { ReasoningStream } from "@/components/session/ReasoningStream";
import { useSessionStream } from "@/components/session/useSessionStream";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { SAMPLE_TRANSCRIPT } from "@/lib/sample";

const MIN_WORDS = 150;

export default function Home() {
  const [text, setText] = useState("");
  const [source, setSource] = useState<"voice" | "paste" | "upload">("paste");
  const [notice, setNotice] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { lines, streaming, failed, run, cancel } = useSessionStream();

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const canSubmit = wordCount > 0 && !streaming;

  const submit = useCallback(() => {
    if (!canSubmit) return;
    setNotice(null);
    // Refusal redirect (F7) arrives as ?topic= — bias intersection toward it.
    const topicHint =
      new URLSearchParams(window.location.search).get("topic") ?? undefined;
    void run({ transcriptText: text, source, topicHint });
  }, [canSubmit, run, text, source]);

  // Global keyboard grammar: ⌘Enter submits, / focuses, Esc cancels the stream.
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
  if (streaming || failed) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <ReasoningStream lines={lines} excerpt={text} active={streaming} />
        {failed ? (
          <div className="mt-8 flex gap-3">
            <Button onClick={() => void run({ transcriptText: text, source })}>
              Try again
            </Button>
            <Button variant="ghost" onClick={cancel}>
              Back
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={cancel}
            className="mt-12 text-xs text-ink-3 transition-colors duration-[120ms] hover:text-ink-2"
          >
            esc to cancel
          </button>
        )}
      </div>
    );
  }

  /* ── input state ────────────────────────────────────────────────── */
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col px-6 pt-24 pb-16">
      <AiLine size="xl" className="mb-8">
        What&apos;s on your mind?
      </AiLine>

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
        className="min-h-[200px]"
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

      <p className="mt-3 text-right text-xs text-ink-3">⌘⏎ to submit</p>
      <SettingsModal />
    </div>
  );
}
