"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";

type RecorderState = "idle" | "recording" | "transcribing" | "unavailable";

export interface RecorderProps {
  onTranscript: (text: string) => void;
  /** Mic or transcription unavailable — parent surfaces the paste fallback. */
  onUnavailable: (reason: string) => void;
  disabled?: boolean;
  /** Pill-sized, for the composer's picker column. */
  compact?: boolean;
}

/**
 * F2 hero control — press, talk, done. Audio goes to /api/transcribe and is
 * never stored. Level meter via AnalyserNode; elapsed time while recording.
 */
export function Recorder({
  onTranscript,
  onUnavailable,
  disabled,
  compact = false,
}: RecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    mediaRef.current?.stream.getTracks().forEach((t) => t.stop());
    mediaRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState("unavailable");
      onUnavailable(
        "Mic permission denied — paste your thinking instead. Ramble is fine.",
      );
      return;
    }

    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      cleanup();
      setState("transcribing");
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      const form = new FormData();
      form.append("audio", new File([blob], "thinking.webm", { type: blob.type }));
      try {
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        const json = (await res.json()) as { text?: string; error?: string };
        if (!res.ok || !json.text) {
          setState(res.status === 501 ? "unavailable" : "idle");
          onUnavailable(json.error ?? "Transcription failed — paste instead.");
          return;
        }
        setState("idle");
        onTranscript(json.text);
      } catch {
        setState("idle");
        onUnavailable("Couldn't reach transcription — paste instead.");
      }
    };

    // level meter
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += (v - 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / data.length) / 40));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    mediaRef.current = recorder;
    recorder.start();
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    setState("recording");
  }, [cleanup, onTranscript, onUnavailable]);

  const stop = useCallback(() => {
    mediaRef.current?.stop();
  }, []);

  if (state === "unavailable") return null;

  const mins = Math.floor(elapsed / 60);
  const secs = String(elapsed % 60).padStart(2, "0");

  if (compact) {
    return state === "recording" ? (
      <button
        type="button"
        onClick={stop}
        aria-label="Stop recording"
        className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-[11.5px] font-semibold text-white"
      >
        <Square size={10} fill="currentColor" aria-hidden />
        <span className="tabular-nums" aria-live="polite">
          {mins}:{secs}
        </span>
        <span
          aria-hidden
          className="inline-block w-0.5 rounded-full bg-white/80 transition-[height] duration-75"
          style={{ height: `${5 + level * 12}px` }}
        />
      </button>
    ) : (
      <button
        type="button"
        onClick={start}
        disabled={disabled || state === "transcribing"}
        aria-label="Record your thinking"
        className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(27_36_48/0.08)] bg-[rgb(255_255_255/0.7)] px-3 py-1.5 text-[11.5px] font-semibold transition-transform hover:scale-[1.04] disabled:pointer-events-none disabled:opacity-50"
      >
        {state === "transcribing" ? (
          <>
            <span className="size-3 animate-spin-fast rounded-full border-2 border-[rgb(10_102_194/0.25)] border-t-accent" />
            Transcribing…
          </>
        ) : (
          <>
            <Mic size={12} aria-hidden /> Record
          </>
        )}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {state === "recording" ? (
        <>
          <button
            type="button"
            onClick={stop}
            aria-label="Stop recording"
            className="flex size-12 items-center justify-center rounded-full bg-accent text-white shadow-sm transition-colors hover:bg-accent-hover"
          >
            <Square size={16} fill="currentColor" />
          </button>
          <div className="flex items-center gap-2" aria-live="polite">
            <span
              aria-hidden
              className="inline-block w-1 rounded-full bg-accent transition-[height] duration-75"
              style={{ height: `${8 + level * 24}px` }}
            />
            <span className="text-sm tabular-nums text-ink-2">
              {mins}:{secs}
            </span>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={disabled || state === "transcribing"}
          aria-label="Record your thinking"
          className="flex size-12 items-center justify-center rounded-full border border-[rgb(27_36_48/0.1)] bg-white text-ink transition-colors hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-40"
        >
          {state === "transcribing" ? (
            <span className="size-3 animate-spin-fast rounded-full border-2 border-[rgb(10_102_194/0.25)] border-t-accent" />
          ) : (
            <Mic size={18} />
          )}
        </button>
      )}
    </div>
  );
}
