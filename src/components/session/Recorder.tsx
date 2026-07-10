"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";

type RecorderState = "idle" | "recording" | "transcribing" | "unavailable";

export interface RecorderProps {
  onTranscript: (text: string) => void;
  /** Mic or transcription unavailable — parent surfaces the paste fallback. */
  onUnavailable: (reason: string) => void;
  disabled?: boolean;
}

/**
 * F2 hero control — press, talk, done. Audio goes to /api/transcribe and is
 * never stored. Level meter via AnalyserNode; elapsed time while recording.
 */
export function Recorder({ onTranscript, onUnavailable, disabled }: RecorderProps) {
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

  return (
    <div className="flex items-center gap-3">
      {state === "recording" ? (
        <>
          <button
            type="button"
            onClick={stop}
            aria-label="Stop recording"
            className="flex size-12 items-center justify-center rounded-full bg-ember text-white shadow-sm transition-colors duration-[120ms] hover:bg-ember-hover"
          >
            <Square size={16} fill="currentColor" />
          </button>
          <div className="flex items-center gap-2" aria-live="polite">
            <span
              aria-hidden
              className="inline-block w-1 rounded-full bg-ember transition-[height] duration-75"
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
          className="flex size-12 items-center justify-center rounded-full border border-line-strong bg-raised text-ink transition-colors duration-[120ms] hover:border-ember hover:text-ember disabled:pointer-events-none disabled:opacity-40"
        >
          {state === "transcribing" ? (
            <span className="size-1.5 animate-ember-breathe rounded-full bg-ember" />
          ) : (
            <Mic size={18} />
          )}
        </button>
      )}
    </div>
  );
}
