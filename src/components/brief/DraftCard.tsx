"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Globe } from "lucide-react";
import { Rationale } from "@/components/ui/AiVoice";
import { useToast } from "@/components/ui/Toast";
import {
  markDraftCopied,
  notMyVoice,
  planDraft,
  postDraftNow,
  saveDraftEdit,
} from "@/app/actions";

export interface DraftData {
  id: string;
  angle: string;
  rationale: string;
  body: string;
  isPrimary: boolean;
  status: string;
}

export interface PostAuthor {
  name: string;
  headline: string | null;
}

/**
 * The draft rendered as a LinkedIn post preview — you edit the thing itself,
 * framed as your audience will meet it. Copy assumes posted; we never ask the
 * user to file paperwork afterwards.
 */
export function DraftCard({
  draft,
  author,
  copySignal,
  linkedinConnected = false,
}: {
  draft: DraftData;
  author: PostAuthor;
  copySignal: number;
  linkedinConnected?: boolean;
}) {
  const [body, setBody] = useState(draft.body);
  const [copied, setCopied] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(draft.status === "posted");
  const bodyRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const copy = async () => {
    const current = bodyRef.current?.innerText ?? body;
    await navigator.clipboard.writeText(current);
    setCopied(true);
    void markDraftCopied(draft.id);
    setTimeout(() => setCopied(false), 2500);
  };

  const copySeen = useRef(copySignal);
  useEffect(() => {
    if (draft.isPrimary && copySignal > copySeen.current) {
      copySeen.current = copySignal;
      void copy();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copySignal, draft.isPrimary]);

  const onBlur = () => {
    const current = bodyRef.current?.innerText ?? body;
    if (current !== body) {
      setBody(current);
      void saveDraftEdit(draft.id, current).catch(() =>
        toast({
          message: "Couldn't save your edit — it's still on screen.",
          tone: "caution",
        }),
      );
    }
  };

  const rewrite = async () => {
    setRewriting(true);
    try {
      const next = await notMyVoice(draft.id);
      setBody(next);
      if (bodyRef.current) bodyRef.current.innerText = next;
    } catch {
      toast({ message: "Rewrite failed — the draft is unchanged.", tone: "danger" });
    } finally {
      setRewriting(false);
    }
  };

  const postNow = async () => {
    setPosting(true);
    try {
      const result = await postDraftNow(draft.id);
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

  const [slot, setSlot] = useState(defaultSlot());
  const [scheduling, setScheduling] = useState(false);
  const schedule = async () => {
    setScheduling(true);
    try {
      await planDraft(draft.id, new Date(slot).toISOString());
      toast({
        message: linkedinConnected
          ? `Scheduled — it posts itself at ${new Date(slot).toLocaleString()}.`
          : `Slot saved for ${new Date(slot).toLocaleString()}. Connect LinkedIn to have it post itself.`,
      });
    } catch {
      toast({ message: "Couldn't save that slot.", tone: "danger" });
    } finally {
      setScheduling(false);
    }
  };

  const initial = (author.name || "Y")[0].toUpperCase();

  function defaultSlot(): string {
    // tomorrow 09:00 local, formatted for <input type="datetime-local">
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <span className="text-[13px] font-bold capitalize">{draft.angle}</span>
        <Rationale>{draft.rationale}</Rationale>
      </div>

      <div className="glass overflow-hidden rounded-[20px]">
        <div className="flex items-center gap-3 px-5 pb-3 pt-4">
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-base font-semibold text-white"
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold">{author.name}</p>
            <p className="truncate text-[11.5px] text-ink-3">
              {author.headline ?? "You"}
            </p>
            <p className="flex items-center gap-1 text-[11px] text-ink-3">
              now · <Globe size={10} aria-hidden />
            </p>
          </div>
        </div>

        <div
          ref={bodyRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={onBlur}
          role="textbox"
          aria-multiline="true"
          aria-label={`${draft.angle} draft — editable`}
          className="whitespace-pre-wrap px-5 pb-4 text-[15px] leading-relaxed outline-none"
        >
          {body}
        </div>

        {/* scheduling row — the slot fires by itself once LinkedIn is connected */}
        <div className="flex flex-wrap items-center gap-2 border-t border-[rgb(27_36_48/0.07)] bg-[rgb(255_255_255/0.4)] px-4 py-2.5">
          <label
            htmlFor={`slot-${draft.id}`}
            className="text-[11.5px] font-semibold text-ink-2"
          >
            Schedule
          </label>
          <input
            id={`slot-${draft.id}`}
            type="datetime-local"
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
            className="rounded-full border border-[rgb(27_36_48/0.1)] bg-white px-3 py-1.5 text-[11.5px] outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => void schedule()}
            disabled={scheduling || posted}
            className="rounded-full bg-[rgb(27_36_48/0.06)] px-3.5 py-1.5 text-[11.5px] font-semibold transition-colors hover:bg-[rgb(27_36_48/0.12)] disabled:opacity-50"
          >
            {scheduling ? "Saving…" : "Add to queue"}
          </button>
          <span className="text-[10.5px] text-ink-3">
            {linkedinConnected
              ? "posts itself at that time"
              : "reminder only until LinkedIn is connected"}
          </span>
        </div>

        <div className="flex items-center justify-between border-t border-[rgb(27_36_48/0.07)] bg-[rgb(255_255_255/0.4)] px-4 py-3">
          <button
            type="button"
            onClick={() => void rewrite()}
            disabled={rewriting}
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold text-ink-2 transition-colors hover:bg-[rgb(27_36_48/0.06)] hover:text-ink disabled:opacity-50"
          >
            {rewriting ? (
              <>
                <span className="size-3 animate-spin-fast rounded-full border-2 border-[rgb(10_102_194/0.25)] border-t-accent" />
                Rewriting…
              </>
            ) : (
              "Not my voice"
            )}
          </button>
          <div className="flex items-center gap-3">
            <a
              href="https://www.linkedin.com/feed/?shareActive=true"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-ink-3 transition-colors hover:text-ink-2"
            >
              open LinkedIn <ExternalLink size={11} aria-hidden />
            </a>
            <button
              type="button"
              onClick={() => void copy()}
              className={`rounded-full px-5 py-2 text-[12.5px] font-semibold transition-transform hover:scale-[1.03] ${
                linkedinConnected && !posted
                  ? "bg-[rgb(27_36_48/0.06)] text-ink hover:bg-[rgb(27_36_48/0.12)]"
                  : "bg-ink text-white"
              }`}
            >
              {copied ? "Copied" : "Copy post"}
            </button>
            {linkedinConnected && (
              <button
                type="button"
                onClick={() => void postNow()}
                disabled={posting || posted}
                className="pill-primary px-5 py-2 text-[12.5px] disabled:opacity-60"
              >
                {posted ? "Posted ✓" : posting ? "Posting…" : "Post to LinkedIn"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
