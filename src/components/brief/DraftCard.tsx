"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/Card";
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

/**
 * F10/F11 — the post as the interface. Body is editable in place (autosave
 * on blur), copy morphs the button and silently assumes posted, and the one
 * AI affordance is "Not my voice".
 */
export function DraftCard({
  draft,
  copySignal,
}: {
  draft: DraftData;
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

  // keyboard C — only the primary card listens
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
        toast({ message: "Couldn't save your edit — it's still on screen.", tone: "caution" }),
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

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <span className="text-sm font-semibold capitalize text-ink">
            {draft.angle}
          </span>
          <Rationale className="mt-0.5">{draft.rationale}</Rationale>
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
        className="whitespace-pre-wrap rounded-md text-base leading-relaxed text-ink outline-none focus:ring-0"
      >
        {body}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
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
    </Card>
  );
}
