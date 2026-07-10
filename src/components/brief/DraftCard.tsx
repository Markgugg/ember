"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Globe } from "lucide-react";
import { Button } from "@/components/ui/Button";
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
 * The draft rendered as a LinkedIn post preview — you're editing the thing
 * itself, framed exactly as your audience will meet it. Copy assumes posted.
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
      {/* angle + reason live above the frame — strategy talk stays out of the post */}
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <span className="text-sm font-semibold capitalize text-ink">
          {draft.angle}
        </span>
        <Rationale>{draft.rationale}</Rationale>
      </div>

      {/* LinkedIn post preview frame */}
      <div className="card-surface overflow-hidden">
        <div className="flex items-center gap-3 px-5 pb-3 pt-4">
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ember text-base font-semibold text-white"
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{author.name}</p>
            <p className="truncate text-xs text-ink-3">
              {author.headline ?? "You"}
            </p>
            <p className="flex items-center gap-1 text-xs text-ink-3">
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
          className="whitespace-pre-wrap px-5 pb-4 text-[15px] leading-relaxed text-ink outline-none"
        >
          {body}
        </div>

        <div className="flex items-center justify-between border-t border-line bg-accent-softer px-4 py-3">
          <Button
            variant="ghost"
            onClick={() => void rewrite()}
            disabled={rewriting}
          >
            {rewriting ? (
              <>
                <span className="size-1.5 animate-ember-breathe rounded-full bg-ember" />
                Rewriting…
              </>
            ) : (
              "Not my voice"
            )}
          </Button>
          <div className="flex items-center gap-3">
            <a
              href="https://www.linkedin.com/feed/?shareActive=true"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-ink-3 transition-colors duration-[120ms] hover:text-ink-2"
            >
              open LinkedIn <ExternalLink size={11} aria-hidden />
            </a>
            <Button onClick={() => void copy()}>
              {copied ? "Copied" : "Copy post"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
