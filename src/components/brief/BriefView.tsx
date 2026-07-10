"use client";

import { useCallback, useEffect, useState } from "react";
import { AiLine, Rationale } from "@/components/ui/AiVoice";
import { SourceChip } from "@/components/ui/SourceChip";
import { DraftCard, type DraftData, type PostAuthor } from "./DraftCard";

export interface BriefViewData {
  briefId: string;
  rationale: string | null;
  recommendation: string | null;
  insightQuote: string | null;
  author: PostAuthor;
  discourse: {
    title: string;
    sources: { url: string; domain: string; ageHours: number; meta?: string }[];
  } | null;
  drafts: DraftData[];
}

/**
 * F6 — one post, the AI's call, reasoning above it. Alternates behind a
 * single quiet fold (post-critique: the system knows which draft is right
 * and acts like it).
 */
export function BriefView({ data }: { data: BriefViewData }) {
  const primary =
    data.drafts.find((d) => d.isPrimary) ?? data.drafts[0] ?? null;
  const alternates = data.drafts.filter((d) => d !== primary);
  const [showAlternates, setShowAlternates] = useState(false);

  // Keyboard: C copies the primary (handled inside DraftCard via event).
  const [copySignal, setCopySignal] = useState(0);
  const onKey = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.isContentEditable ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "INPUT"
    )
      return;
    if (e.key === "c" && !e.metaKey && !e.ctrlKey) setCopySignal((n) => n + 1);
  }, []);
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  if (!primary) {
    return (
      <div className="mx-auto max-w-[640px] px-6 py-24">
        <AiLine size="lg">This brief lost its drafts. Start a fresh one?</AiLine>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[720px] animate-rise-in px-6 py-16">
      {/* 1 — the intersection, stated */}
      {data.rationale && (
        <AiLine size="xl" className="mb-3">
          {data.rationale}
        </AiLine>
      )}
      {data.discourse && data.discourse.sources.length > 0 && (
        <div className="mb-10 flex flex-wrap gap-2">
          {data.discourse.sources.map((s, i) => (
            <SourceChip
              key={i}
              url={s.url}
              domain={s.domain}
              age={formatAge(s.ageHours)}
              meta={s.meta}
            />
          ))}
        </div>
      )}

      {/* 2 — the post */}
      <DraftCard draft={primary} author={data.author} copySignal={copySignal} />

      {/* 3 — the recommendation */}
      {data.recommendation && (
        <Rationale className="mt-4">{data.recommendation}</Rationale>
      )}

      {/* 4 — the fold */}
      {alternates.length > 0 && (
        <div className="mt-12">
          <button
            type="button"
            onClick={() => setShowAlternates((v) => !v)}
            aria-expanded={showAlternates}
            className="text-sm text-ink-3 transition-colors duration-[120ms] hover:text-ink-2"
          >
            {showAlternates
              ? "Hide the other angles"
              : `${alternates.length === 1 ? "One other angle" : "Two other angles"} didn't make the cut — see ${alternates.length === 1 ? "it" : "them"}`}
          </button>
          {showAlternates && (
            <div className="mt-6 flex flex-col gap-6">
              {alternates.map((d) => (
                <DraftCard
                  key={d.id}
                  draft={d}
                  author={data.author}
                  copySignal={0}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <p className="mt-10 text-right text-xs text-ink-3">
        c to copy · click into the post to edit
      </p>
    </div>
  );
}

function formatAge(hours: number): string {
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
