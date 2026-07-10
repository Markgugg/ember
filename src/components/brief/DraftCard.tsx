"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Globe } from "lucide-react";
import { Rationale } from "@/components/ui/AiVoice";
import { useToast } from "@/components/ui/Toast";
import { markDraftCopied, notMyVoice, saveDraftEdit } from "@/app/actions";

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
}: {
  draft: DraftData;
  author: PostAuthor;
  copySignal: number;
}) {
  const [body, setBody] = useState(draft.body);
  const [copied, setCopied] = useState(false);
  const [rewriting, setRewriting] = useState(false);
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

  const initial = (author.name || "Y")[0].toUpperCase();

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
              className="rounded-full bg-ink px-5 py-2 text-[12.5px] font-semibold text-white transition-transform hover:scale-[1.03]"
            >
              {copied ? "Copied" : "Copy post"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
