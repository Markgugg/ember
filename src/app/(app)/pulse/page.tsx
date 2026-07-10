import Link from "next/link";
import { Flame, Radio } from "lucide-react";
import { getRepo } from "@/lib/db";
import { getOrSeedSnapshot } from "@/lib/discourse";
import { SourceChip } from "@/components/ui/SourceChip";

export const dynamic = "force-dynamic";

/** Requirement 1 as a destination: what the AI world is arguing about, live. */
export default async function PulsePage() {
  const repo = await getRepo();
  const { items, live } = await getOrSeedSnapshot(repo);
  const sorted = [...items].sort((a, b) => b.velocity - a.velocity);

  return (
    <div className="mx-auto max-w-[900px] px-8 py-8">
      <div className="mb-1 flex items-center gap-2">
        <Radio size={18} className="text-ember" aria-hidden />
        <h1 className="text-xl font-semibold text-ink">AI Pulse</h1>
      </div>
      <p className="mb-6 text-sm text-ink-2">
        {live ? (
          <>
            <span className="mr-1.5 inline-block size-1.5 rounded-full bg-success align-middle" />
            Live from Hacker News — what the AI world is arguing about right
            now. Refreshes every 3 hours.
          </>
        ) : (
          <>
            <span className="mr-1.5 inline-block size-1.5 rounded-full bg-caution align-middle" />
            Live feed unreachable — showing the debates that never die.
          </>
        )}
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {sorted.map((item) => (
          <article key={item.id} className="card-surface flex flex-col p-5">
            <div className="mb-2 flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold leading-snug text-ink">
                {item.title}
              </h2>
              {item.velocity > 0.6 && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-ember">
                  <Flame size={11} aria-hidden /> hot
                </span>
              )}
            </div>
            <p className="mb-3 text-sm text-ink-2">{item.summary}</p>
            {item.stanceA && (
              <div className="mb-3 rounded-md border border-line bg-accent-softer p-3 text-xs">
                <p className="mb-1 text-ink">
                  <span className="font-semibold">One side:</span> {item.stanceA}
                </p>
                <p className="text-ink">
                  <span className="font-semibold">Other side:</span>{" "}
                  {item.stanceB}
                </p>
              </div>
            )}
            <div className="mt-auto flex items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap gap-1.5">
                {item.sources.slice(0, 2).map((s, i) => (
                  <SourceChip
                    key={i}
                    url={s.url}
                    domain={s.domain}
                    meta={s.meta}
                  />
                ))}
              </div>
              <Link
                href={`/compose?topic=${encodeURIComponent(item.title)}`}
                className="shrink-0 text-sm font-medium text-ember hover:text-ember-hover"
              >
                Write about this →
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
