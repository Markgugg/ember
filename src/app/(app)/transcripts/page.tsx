import { getUserId } from "@/lib/identity";
import { getConversations } from "@/lib/view";
import { TranscriptIntake } from "@/components/transcripts/TranscriptIntake";
import { ComposeLink } from "@/components/composer/ComposeLink";

export const dynamic = "force-dynamic";

/**
 * Source 2 — your conversations. Each one is mined into "angles": the claims
 * you actually made, quoted verbatim from your own words. Click an angle and
 * Current writes the post from it.
 */
export default async function TranscriptsPage() {
  const conversations = await getConversations(await getUserId());

  return (
    <div className="mx-auto flex max-w-[1200px] animate-fade-up flex-col gap-[18px] px-8 pb-12 pt-[100px]">
      <div>
        <h1 className="text-[27px] font-bold tracking-[-0.02em]">Your voice</h1>
        <p className="mt-1 text-[13px] text-ink-2">
          Every conversation you add becomes post angles — the substance the
          news can&apos;t give you.
        </p>
      </div>

      <TranscriptIntake />

      {conversations.length === 0 ? (
        <div className="glass rounded-[20px] p-12 text-center">
          <p className="text-[14px] text-ink-2">
            Nothing here yet. Paste a meeting, a podcast, a customer call — two
            minutes of you thinking out loud is enough.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {conversations.map((c) => (
            <article key={c.id} className="glass rounded-[20px] px-[22px] py-4">
              <div className="flex items-center gap-3">
                <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[rgb(10_102_194/0.09)] text-[12px] font-bold text-accent">
                  {c.angles.length || "–"}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold">
                    {c.name}
                  </div>
                  <div className="text-[11.5px] text-ink-2">{c.meta}</div>
                </div>
                <div className="flex-1" />
                <ComposeLink
                  seg="transcript"
                  conversation={c.id}
                  className="pill-primary shrink-0 px-4 py-2 text-[11.5px]"
                >
                  Draft from this
                </ComposeLink>
              </div>

              {c.angles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.angles.map((a) => (
                    <ComposeLink
                      key={a.id}
                      seg="transcript"
                      insight={a.id}
                      className="inline-flex max-w-full items-center gap-2 rounded-full border border-[rgb(255_255_255/0.8)] bg-[rgb(255_255_255/0.68)] px-4 py-2 text-[12px] font-semibold shadow-[0_2px_8px_rgb(31_45_65/0.06),inset_0_1px_0_rgb(255_255_255/0.9)] backdrop-blur-md transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_8px_20px_rgb(31_45_65/0.12)]"
                    >
                      <span aria-hidden className="shrink-0 text-ink-4">
                        “
                      </span>
                      <span className="truncate">{a.text}</span>
                      <span aria-hidden className="shrink-0 text-ink-4">
                        ”
                      </span>
                      {a.recurrence > 1 && (
                        <span className="shrink-0 rounded-full bg-[rgb(10_102_194/0.09)] px-1.5 py-px text-[10px] text-accent">
                          {a.recurrence}×
                        </span>
                      )}
                      <span aria-hidden className="shrink-0 font-bold text-accent">
                        →
                      </span>
                    </ComposeLink>
                  ))}
                </div>
              )}

              {c.angles.length === 0 && (
                <p className="mt-3 font-serif text-[12.5px] text-ink-2">
                  — no defensible claims in this one yet. It reads as notes, not
                  a take.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
