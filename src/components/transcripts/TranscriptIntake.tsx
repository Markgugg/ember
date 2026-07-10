"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Recorder } from "@/components/session/Recorder";
import { useToast } from "@/components/ui/Toast";
import { addTranscript } from "@/app/actions";
import { SAMPLE_TRANSCRIPT } from "@/lib/sample";

/** Paste panel + drop panel. Both bank a conversation; mining happens on draft. */
export function TranscriptIntake() {
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  const add = (raw: string, source: "paste" | "upload" | "voice") => {
    startTransition(async () => {
      try {
        await addTranscript(raw, source);
        setText("");
        setNotice(null);
        toast({ message: "Added to your library." });
        router.refresh();
      } catch {
        setNotice("That's too short to hold a claim — give it a few sentences.");
      }
    });
  };

  const takeFile = async (file: File) => {
    if (/\.(mp3|m4a|wav|webm|mp4)$/i.test(file.name)) {
      const form = new FormData();
      form.append("audio", file);
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const json = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !json.text) {
        setNotice(json.error ?? "Couldn't transcribe that file.");
        return;
      }
      add(json.text, "upload");
      return;
    }
    if (!/\.(txt|vtt)$/i.test(file.name)) {
      setNotice("Audio (mp3, m4a) or text (.txt, .vtt) — those work.");
      return;
    }
    add(await file.text(), "upload");
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* paste */}
      <div className="glass flex flex-col gap-2.5 rounded-[20px] px-[22px] py-[18px]">
        <span className="text-[14px] font-bold">Paste a transcript</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="A meeting, podcast, voice memo, customer call…"
          className="h-[110px] resize-none rounded-[14px] border border-[rgb(27_36_48/0.08)] bg-[rgb(255_255_255/0.65)] px-4 py-3.5 text-[13px] outline-none placeholder:text-ink-3 focus:border-accent"
        />
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={pending || words < 10}
            onClick={() => add(text, "paste")}
            className="pill-primary px-5 py-[9px] text-[12.5px]"
          >
            {pending ? "Adding…" : "Add to library"}
          </button>
          <Recorder
            compact
            onTranscript={(t) => add(t, "voice")}
            onUnavailable={(r) => setNotice(r)}
          />
          <span className="text-[11.5px] text-ink-3">
            {words > 0 ? `${words} words` : "two minutes of rambling is plenty"}
          </span>
          {text.length === 0 && (
            <button
              type="button"
              onClick={() => setText(SAMPLE_TRANSCRIPT)}
              className="text-[11.5px] font-semibold text-accent hover:underline"
            >
              use a sample
            </button>
          )}
        </div>
        {notice && (
          <p className="flex items-start gap-2 text-[11.5px] text-ink-2">
            <span
              aria-hidden
              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-caution"
            />
            {notice}
          </p>
        )}
      </div>

      {/* drop */}
      <div className="glass flex flex-col gap-2.5 rounded-[20px] px-[22px] py-[18px]">
        <span className="text-[14px] font-bold">Upload audio or text</span>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.vtt,.mp3,.m4a,.wav,.webm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void takeFile(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void takeFile(f);
          }}
          className={`flex flex-1 flex-col items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed p-[18px] transition-colors ${
            dragging
              ? "border-accent bg-[rgb(10_102_194/0.06)]"
              : "border-[rgb(27_36_48/0.2)] hover:bg-[rgb(255_255_255/0.5)]"
          }`}
        >
          <Upload size={24} strokeWidth={1.5} className="text-accent" aria-hidden />
          <span className="text-[13px] font-semibold text-ink">
            Drop a file here
          </span>
          <span className="text-[11px] text-ink-2">
            mp3, m4a, txt, vtt · audio transcribed automatically
          </span>
        </button>
      </div>
    </div>
  );
}
