"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, FileUp, X } from "lucide-react";
import { useSessionStream } from "@/components/session/useSessionStream";
import { Recorder } from "@/components/session/Recorder";
import { useToast } from "@/components/ui/Toast";
import {
  loadBriefDraft,
  loadComposerSources,
  markDraftCopied,
  planDraft,
  postDraftNow,
  saveDraftEdit,
  type ComposerSources,
} from "@/app/actions";
import { SAMPLE_TRANSCRIPT } from "@/lib/sample";

type Seg = "news" | "transcript" | "both";

const SEGS: { key: Seg; label: string }[] = [
  { key: "news", label: "From the news" },
  { key: "transcript", label: "From a transcript" },
  { key: "both", label: "Blend both" },
];

/**
 * The composer sheet. Its three segments are the product's two required
 * sources and their intersection:
 *   news       → pick a story; Current finds which of your claims meets it
 *   transcript → bring a conversation; Current mines the claim worth posting
 *   both       → a story AND a conversation, pinned together
 * Any mode can end in a refusal — that path is a first-class result, not an error.
 */
export function ComposerSheet() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();

  const composeParam = params.get("compose");
  const open = composeParam !== null;
  const storyParam = params.get("story");
  const conversationParam = params.get("conversation");
  const insightParam = params.get("insight");

  const [seg, setSeg] = useState<Seg>("news");
  const [sources, setSources] = useState<ComposerSources | null>(null);
  const [storyId, setStoryId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const [draft, setDraft] = useState<{
    draftId: string;
    body: string;
    angle: string;
    rationale: string;
    sourceNote: string;
  } | null>(null);
  const [refusedBriefId, setRefusedBriefId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { lines, streaming, failed, run, cancel } = useSessionStream({
    navigateOnDone: false,
  });

  /* ── open/close as URL state ──────────────────────────────────── */
  const close = useCallback(() => {
    cancel();
    const next = new URLSearchParams(params.toString());
    ["compose", "story", "conversation", "insight"].forEach((k) =>
      next.delete(k),
    );
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [cancel, params, pathname, router]);

  // Seed state from the URL each time the sheet opens.
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      openedFor.current = null;
      return;
    }
    const key = params.toString();
    if (openedFor.current === key) return;
    openedFor.current = key;

    setSeg((composeParam as Seg) ?? "news");
    setStoryId(storyParam);
    setConversationId(conversationParam);
    setDraft(null);
    setRefusedBriefId(null);
    setPasted("");
    setNotice(null);

    // An angle chip is a one-click generate: the claim is already chosen.
    if (insightParam) {
      void run({ insightId: insightParam, discourseItemId: storyParam ?? undefined });
    }
  }, [open, params, composeParam, storyParam, conversationParam, insightParam, run]);

  useEffect(() => {
    if (!open || sources) return;
    void loadComposerSources().then(setSources);
  }, [open, sources]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  /* ── when the stream finishes, pull the draft in ───────────────── */
  const doneBriefId = lines.find((l) => l.stage === "done")?.briefId;
  useEffect(() => {
    if (!doneBriefId || draft || refusedBriefId) return;
    void loadBriefDraft(doneBriefId).then((d) => {
      if (d) setDraft(d);
      else setRefusedBriefId(doneBriefId); // no drafts = Current refused
    });
  }, [doneBriefId, draft, refusedBriefId]);

  const story = useMemo(
    () => sources?.stories.find((s) => s.id === storyId) ?? null,
    [sources, storyId],
  );
  const conversation = useMemo(
    () => sources?.conversations.find((c) => c.id === conversationId) ?? null,
    [sources, conversationId],
  );

  const canGenerate = useMemo(() => {
    if (streaming) return false;
    // A pinned story needs a banked claim to meet; with none, this tab can
    // only ever refuse, so don't let it be clicked.
    if (seg === "news") return Boolean(storyId) && sources?.hasClaims !== false;
    // transcript & blend: a conversation is required; in blend the story is
    // optional — with none picked, Current auto-picks today's best match.
    return Boolean(conversationId) || pasted.trim().split(/\s+/).length > 20;
  }, [seg, storyId, conversationId, pasted, streaming, sources]);

  const generate = () => {
    setDraft(null);
    setRefusedBriefId(null);
    setPosted(false);
    const usePaste = pasted.trim().length > 40 && !conversationId;
    void run({
      discourseItemId: seg === "transcript" ? undefined : (storyId ?? undefined),
      transcriptId: seg === "news" ? undefined : (conversationId ?? undefined),
      transcriptText: seg !== "news" && usePaste ? pasted : undefined,
      source: "paste",
    });
  };

  const onUpload = async (file: File) => {
    if (!/\.(txt|vtt)$/i.test(file.name)) {
      setNotice("Couldn't read that file — .txt and .vtt work.");
      return;
    }
    setPasted(await file.text());
    setConversationId(null);
    setNotice(null);
  };

  const copy = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(draft.body);
    setCopied(true);
    void markDraftCopied(draft.draftId);
    setTimeout(() => setCopied(false), 2400);
  };

  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const postNow = async () => {
    if (!draft) return;
    setPosting(true);
    try {
      const result = await postDraftNow(draft.draftId);
      if (result.ok) {
        setPosted(true);
        toast({ message: "Posted to LinkedIn." });
      } else {
        toast({ message: result.message, tone: "danger" });
      }
    } finally {
      setPosting(false);
    }
  };

  if (!open) return null;

  const btnLabel = streaming
    ? "Reading both sources…"
    : seg === "both"
      ? "Blend into a post"
      : seg === "news"
        ? "Find my angle on this"
        : "Find the post";

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-[rgb(27_36_48/0.28)] p-4 backdrop-blur-[10px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New post"
        className="glass flex h-[min(680px,92vh)] w-full max-w-[960px] animate-spring-in flex-col overflow-hidden rounded-[26px] text-ink"
        style={{
          background: "rgb(255 255 255 / 0.78)",
          backdropFilter: "blur(44px) saturate(1.8)",
          boxShadow:
            "0 40px 90px rgb(31 45 65 / 0.3), inset 0 1px 0 rgb(255 255 255 / 0.95)",
        }}
      >
        {/* header */}
        <div className="flex flex-none items-center gap-3.5 px-[22px] py-4">
          <span className="text-base font-bold tracking-[-0.01em] text-ink">
            New post
          </span>
          <div className="flex gap-0.5 rounded-xl bg-[rgb(27_36_48/0.06)] p-[3px]">
            {SEGS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSeg(s.key)}
                aria-pressed={seg === s.key}
                className={`rounded-[9px] px-[15px] py-1.5 text-xs font-semibold transition-colors duration-200 ${
                  seg === s.key
                    ? "bg-accent text-white shadow-[0_2px_10px_rgb(10_102_194/0.35)]"
                    : "text-ink-2 hover:bg-[rgb(255_255_255/0.6)]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={close}
            aria-label="Close composer"
            className="flex size-7 items-center justify-center rounded-full bg-[rgb(27_36_48/0.07)] transition-colors hover:bg-[rgb(27_36_48/0.14)]"
          >
            <X size={11} strokeWidth={1.8} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[330px_1fr]">
          {/* ── left: pickers ──────────────────────────────────── */}
          <div className="flex min-h-0 flex-col gap-2.5 overflow-auto px-[22px] pb-5 pt-1.5">
            {seg === "both" && (story || conversation) && (
              <div className="rounded-[14px] border-[1.5px] border-[rgb(10_102_194/0.35)] bg-[rgb(10_102_194/0.06)] p-3">
                <SectionLabel className="mb-1.5">
                  Story + conversation
                </SectionLabel>
                <p className="truncate text-[12px] font-semibold">
                  {story?.title ?? "auto-pick from today's feed"}
                </p>
                <p className="my-1 text-center text-[11px] font-bold text-ink-4">
                  +
                </p>
                <p className="truncate text-[12px] font-semibold">
                  {conversation?.name ??
                    (pasted.trim().length > 40
                      ? "your pasted conversation"
                      : "— pick a conversation below")}
                </p>
              </div>
            )}

            {seg === "news" && sources !== null && !sources.hasClaims && (
              <div className="mb-3 shrink-0 rounded-[14px] border border-[rgb(10_102_194/0.22)] bg-[rgb(10_102_194/0.06)] p-3.5">
                <p className="mb-1 text-[12.5px] font-semibold text-ink">
                  Current has nothing of yours to say about this yet.
                </p>
                <p className="mb-2.5 text-[12px] leading-relaxed text-ink-2">
                  A story on its own isn&apos;t a post. Give it something you
                  actually said and it will find where the two meet.
                </p>
                <button
                  type="button"
                  onClick={() => setSeg("both")}
                  className="rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold text-white transition-transform hover:scale-[1.03]"
                >
                  Add a conversation
                </button>
              </div>
            )}

            {(seg === "news" || seg === "both") && (
              <>
                <SectionLabel>
                  {seg === "both" ? "Story — optional" : "Pick a story"}
                </SectionLabel>
                {sources === null ? (
                  <SkeletonRows />
                ) : sources.stories.length === 0 ? (
                  <EmptyNote>No live stories right now. Try again shortly.</EmptyNote>
                ) : (
                  <div
                    className={`flex flex-col gap-2.5 ${
                      seg === "both"
                        ? "max-h-[190px] shrink-0 overflow-y-auto pr-1"
                        : ""
                    }`}
                  >
                    {sources.stories.slice(0, seg === "both" ? 8 : 6).map((s) => (
                      <PickRow
                        key={s.id}
                        title={s.title}
                        meta={`${s.domain}${s.buzz ? ` · ${s.buzz}` : ""}`}
                        selected={storyId === s.id}
                        onClick={() => setStoryId(storyId === s.id ? null : s.id)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {(seg === "transcript" || seg === "both") && (
              <>
                <SectionLabel className={seg === "both" ? "mt-2" : ""}>
                  {seg === "both" ? "Conversation" : "Pick a conversation"}
                </SectionLabel>
                {sources === null ? (
                  <SkeletonRows />
                ) : (
                  <>
                    {sources.conversations.slice(0, 5).map((c) => (
                      <PickRow
                        key={c.id}
                        title={c.name}
                        meta={c.meta}
                        selected={conversationId === c.id}
                        onClick={() => {
                          setConversationId(conversationId === c.id ? null : c.id);
                          setPasted("");
                        }}
                      />
                    ))}
                    {!conversationId && (
                      <>
                        <textarea
                          value={pasted}
                          onChange={(e) => setPasted(e.target.value)}
                          placeholder={
                            sources.conversations.length === 0
                              ? "Paste a meeting, podcast, or voice memo — or just ramble…"
                              : "…or paste / ramble a new one"
                          }
                          className="min-h-[96px] shrink-0 resize-none rounded-[14px] border border-[rgb(27_36_48/0.08)] bg-[rgb(255_255_255/0.65)] p-3.5 text-[12.5px] outline-none placeholder:text-ink-3 focus:border-accent"
                        />
                        <div className="flex items-center gap-2">
                          <Recorder
                            compact
                            onTranscript={(t) => {
                              setPasted(t);
                              setConversationId(null);
                            }}
                            onUnavailable={(r) => setNotice(r)}
                          />
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
                          <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(27_36_48/0.08)] bg-[rgb(255_255_255/0.7)] px-3 py-1.5 text-[11.5px] font-semibold transition-transform hover:scale-[1.04]"
                          >
                            <FileUp size={12} aria-hidden /> Upload
                          </button>
                          {pasted.length === 0 && (
                            <button
                              type="button"
                              onClick={() => setPasted(SAMPLE_TRANSCRIPT)}
                              className="text-[11px] font-semibold text-accent hover:underline"
                            >
                              use sample
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {seg === "both" && (
              <p className="mt-1 shrink-0 text-[10.5px] leading-relaxed text-ink-3">
                {storyId
                  ? "Blend pins the story and the conversation together. If nothing you said meets that story, Current says so instead of inventing an opinion for you."
                  : "No story picked — Current will auto-pick today's best match for what you said."}
              </p>
            )}

            {notice && (
              <p className="flex items-start gap-2 text-[11.5px] text-ink-2">
                <span
                  aria-hidden
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-caution"
                />
                {notice}
              </p>
            )}

            <div className="flex-1" />

            <button
              type="button"
              onClick={generate}
              disabled={!canGenerate}
              className="pill-primary p-3 text-[13px]"
            >
              {btnLabel}
            </button>

            {streaming && (
              <div className="flex items-center justify-center gap-2 text-[11.5px] text-ink-2">
                <span
                  aria-hidden
                  className="size-3 animate-spin-fast rounded-full border-2 border-[rgb(10_102_194/0.25)] border-t-accent"
                />
                Writing in your voice…
              </div>
            )}
          </div>

          {/* ── right: reasoning → draft ───────────────────────── */}
          <div className="flex min-h-0 flex-col gap-3 border-l border-[rgb(27_36_48/0.07)] px-[22px] pb-5 pt-1.5">
            {draft ? (
              <DraftPane
                draft={draft}
                onBodyChange={(body) => {
                  setDraft({ ...draft, body });
                  void saveDraftEdit(draft.draftId, body).catch(() =>
                    toast({
                      message: "Couldn't save that edit — it's still on screen.",
                      tone: "caution",
                    }),
                  );
                }}
              />
            ) : refusedBriefId ? (
              <RefusedPane briefId={refusedBriefId} onRetry={() => setRefusedBriefId(null)} />
            ) : streaming || lines.length > 0 ? (
              <ReasoningPane lines={lines} streaming={streaming} failed={failed} />
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-2xl border border-[rgb(27_36_48/0.08)] bg-[rgb(255_255_255/0.65)]">
                <p className="px-10 text-center text-[13px] leading-relaxed text-ink-3">
                  Your draft appears here — built from what you said, aimed at
                  what the world is arguing about today.
                </p>
              </div>
            )}

            {draft && (
              <>
                <p className="text-[10.5px] leading-relaxed text-ink-3">
                  Sources: {draft.sourceNote}
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-[11.5px] text-ink-3">
                    {draft.body.length} / 3000
                  </span>
                  <div className="flex-1" />
                  <Link
                    href={`/brief/${doneBriefId}`}
                    className="rounded-full bg-[rgb(27_36_48/0.06)] px-4 py-[9px] text-[12.5px] font-semibold text-ink transition-colors hover:bg-[rgb(27_36_48/0.12)]"
                  >
                    Other angles
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      void planDraft(
                        draft.draftId,
                        new Date(Date.now() + 86_400_000).toISOString(),
                      );
                      toast({ message: "Planned for tomorrow — it's a reminder, not an auto-post." });
                    }}
                    className="rounded-full bg-[rgb(27_36_48/0.06)] px-4 py-[9px] text-[12.5px] font-semibold text-ink transition-colors hover:bg-[rgb(27_36_48/0.12)]"
                  >
                    Add to queue
                  </button>
                  <button
                    type="button"
                    onClick={() => void copy()}
                    className={`rounded-full px-[22px] py-[9px] text-[12.5px] font-semibold transition-transform hover:scale-[1.03] ${
                      sources?.linkedinConnected
                        ? "bg-[rgb(27_36_48/0.06)] text-ink hover:bg-[rgb(27_36_48/0.12)]"
                        : "bg-ink text-white"
                    }`}
                  >
                    {copied ? "Copied" : "Copy post"}
                  </button>
                  {sources?.linkedinConnected && (
                    <button
                      type="button"
                      onClick={() => void postNow()}
                      disabled={posting || posted}
                      className="pill-primary px-[22px] py-[9px] text-[12.5px] disabled:opacity-60"
                    >
                      {posted ? "Posted ✓" : posting ? "Posting…" : "Post now"}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── panes ────────────────────────────────────────────────────────── */

function ReasoningPane({
  lines,
  streaming,
  failed,
}: {
  lines: { stage: string; line: string }[];
  streaming: boolean;
  failed: boolean;
}) {
  return (
    <div
      aria-live="polite"
      className="flex flex-1 flex-col gap-3 overflow-auto rounded-2xl border border-[rgb(27_36_48/0.08)] bg-[rgb(255_255_255/0.65)] p-6"
    >
      {lines
        .filter((l) => l.stage !== "done")
        .map((l, i, arr) => {
          const active = streaming && i === arr.length - 1;
          return (
            <p
              key={i}
              className={`flex animate-fade-up items-start gap-2.5 font-serif text-[15px] leading-snug transition-colors ${
                active ? "text-ink" : "text-ink-2"
              } ${l.stage === "error" ? "text-danger" : ""} ${
                l.stage === "discourse_fallback" ? "text-caution" : ""
              }`}
            >
              {active && (
                <span
                  aria-hidden
                  className="mt-2 size-1.5 shrink-0 animate-pulse-dot rounded-full bg-accent"
                />
              )}
              {l.line}
            </p>
          );
        })}
      {failed && (
        <p className="mt-2 text-[12px] text-ink-3">
          Your words are safe — press the button again.
        </p>
      )}
    </div>
  );
}

function DraftPane({
  draft,
  onBodyChange,
}: {
  draft: { body: string; angle: string; rationale: string };
  onBodyChange: (body: string) => void;
}) {
  return (
    <>
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-accent">
          {draft.angle}
        </span>
        <span className="truncate font-serif text-[12px] text-ink-2">
          — {draft.rationale}
        </span>
      </div>
      <textarea
        value={draft.body}
        onChange={(e) => onBodyChange(e.target.value)}
        aria-label="Your draft"
        className="flex-1 resize-none rounded-2xl border border-[rgb(27_36_48/0.08)] bg-[rgb(255_255_255/0.65)] px-5 py-4 text-[14px] leading-relaxed outline-none focus:border-accent"
      />
    </>
  );
}

function RefusedPane({
  briefId,
  onRetry,
}: {
  briefId: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-[rgb(27_36_48/0.08)] bg-[rgb(255_255_255/0.65)] px-10 text-center">
      <p className="font-serif text-lg leading-snug text-ink">
        Nothing here is worth your name on it today.
      </p>
      <p className="text-[12.5px] leading-relaxed text-ink-2">
        Current only writes when something you actually said meets what the
        world is arguing about. Bring it a conversation, or pick a different
        story.
      </p>
      <div className="flex gap-2">
        <Link
          href={`/brief/${briefId}`}
          className="pill-primary px-4 py-2 text-[12.5px]"
        >
          See why
        </Link>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-[rgb(27_36_48/0.06)] px-4 py-2 text-[12.5px] font-semibold transition-colors hover:bg-[rgb(27_36_48/0.12)]"
        >
          Try another
        </button>
      </div>
    </div>
  );
}

/* ── bits ─────────────────────────────────────────────────────────── */

function SectionLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`text-[10.5px] font-bold uppercase tracking-[0.09em] text-ink-3 ${className}`}
    >
      {children}
    </div>
  );
}

function PickRow({
  title,
  meta,
  selected,
  onClick,
}: {
  title: string;
  meta: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex items-center gap-2.5 rounded-[14px] border-[1.5px] px-3.5 py-[11px] text-left transition-colors ${
        selected
          ? "border-[rgb(10_102_194/0.5)] bg-[rgb(10_102_194/0.08)]"
          : "border-transparent bg-[rgb(255_255_255/0.55)] hover:border-[rgb(10_102_194/0.3)]"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold leading-snug">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[10.5px] text-ink-3">
          {meta}
        </span>
      </span>
      {selected && (
        <Check size={14} strokeWidth={2} className="shrink-0 text-accent" />
      )}
    </button>
  );
}

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-2.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[52px] animate-pulse rounded-[14px] bg-[rgb(255_255_255/0.5)]"
        />
      ))}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[14px] border border-dashed border-[rgb(27_36_48/0.18)] p-4 text-center text-[11.5px] text-ink-3">
      {children}
    </p>
  );
}
