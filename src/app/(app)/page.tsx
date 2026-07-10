import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  AudioLines,
  Flame,
  Lightbulb,
  PenLine,
  Radio,
} from "lucide-react";
import { getRepo } from "@/lib/db";
import { getUserId } from "@/lib/identity";
import { getDashboardData } from "@/lib/ideas";
import { SourceChip } from "@/components/ui/SourceChip";
import { Rationale } from "@/components/ui/AiVoice";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const userId = await getUserId();
  const repo = await getRepo();
  const profile = await repo.getProfile(userId);
  if (!profile?.onboardedAt) redirect("/welcome");

  const data = await getDashboardData(userId);
  const { stats } = data;
  const firstName = profile.displayName?.split(" ")[0] ?? "";

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">
            Welcome back{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            {data.live ? (
              <>
                <span className="mr-1.5 inline-block size-1.5 rounded-full bg-success align-middle" />
                Watching the AI conversation live
                {stats.snapshotAgeHours !== null &&
                  ` · refreshed ${formatAge(stats.snapshotAgeHours)}`}
              </>
            ) : (
              <>
                <span className="mr-1.5 inline-block size-1.5 rounded-full bg-caution align-middle" />
                Live feed unreachable — using evergreen debates
              </>
            )}
          </p>
        </div>
        <Link
          href="/compose"
          className="flex h-10 items-center gap-2 rounded-md bg-ember px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-ember-hover"
        >
          <PenLine size={15} aria-hidden />
          Write a Post
        </Link>
      </div>

      {/* stat tiles */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <StatTile label="Insights banked" value={stats.insightsBanked} />
        <StatTile label="Posts drafted" value={stats.postsDrafted} />
        <StatTile label="Posts shipped" value={stats.postsShipped} />
      </div>

      <div className="grid grid-cols-[1fr_360px] gap-6">
        {/* left column */}
        <div className="flex min-w-0 flex-col gap-6">
          {/* Post ideas — vault × live discourse */}
          <section className="card-surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
                <Lightbulb size={16} className="text-ember" aria-hidden />
                Post ideas for you
              </h2>
              <span className="text-xs text-ink-3">
                your thinking × today&apos;s conversation
              </span>
            </div>

            {data.ideas.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {data.ideas.map((idea) => (
                  <div
                    key={idea.insight.id}
                    className="flex flex-col justify-between rounded-md border border-line bg-accent-softer p-4"
                  >
                    <p className="mb-3 line-clamp-4 text-sm text-ink">
                      {idea.insight.text}
                    </p>
                    <div>
                      <p className="mb-3 line-clamp-2 text-xs text-ink-3">
                        ↔ {idea.item.title}
                      </p>
                      <Link
                        href={`/compose?insight=${idea.insight.id}`}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-ember hover:text-ember-hover"
                      >
                        Generate post <ArrowRight size={14} aria-hidden />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-line p-6 text-center">
                <p className="text-sm text-ink-2">
                  No banked thinking matches today&apos;s conversation yet.
                </p>
                <Rationale className="mt-2 inline-block">
                  drop a transcript below and I&apos;ll start finding overlaps.
                </Rationale>
              </div>
            )}
          </section>

          {/* Transcript intake — requirement 2, front and center */}
          <section className="card-surface flex items-center justify-between gap-6 bg-gradient-to-r from-accent-soft to-raised p-5">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
                <AudioLines size={16} className="text-ember" aria-hidden />
                Got thinking to unload?
              </h2>
              <p className="mt-1 max-w-md text-sm text-ink-2">
                Paste a meeting transcript, upload a voice-note transcript, or
                record two minutes of rambling — ember mines the claims worth
                your name.
              </p>
            </div>
            <Link
              href="/compose"
              className="flex h-10 shrink-0 items-center gap-2 rounded-md border border-line bg-raised px-4 text-sm font-medium text-ink shadow-sm transition-colors hover:border-line-strong"
            >
              Drop a transcript <ArrowRight size={14} aria-hidden />
            </Link>
          </section>
        </div>

        {/* right column — requirement 1: live AI discourse */}
        <aside className="card-surface h-fit p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
              <Radio size={16} className="text-ember" aria-hidden />
              AI right now
            </h2>
            <Link
              href="/pulse"
              className="text-xs font-medium text-ember hover:text-ember-hover"
            >
              See all →
            </Link>
          </div>
          <div className="flex flex-col">
            {data.discourse.slice(0, 4).map((item, i) => (
              <div
                key={item.id}
                className={`py-3 ${i > 0 ? "border-t border-line" : "pt-0"}`}
              >
                <div className="mb-1 flex items-start gap-2">
                  {item.velocity > 0.6 && (
                    <Flame
                      size={13}
                      className="mt-0.5 shrink-0 text-caution"
                      aria-hidden
                    />
                  )}
                  <p className="text-sm font-medium leading-snug text-ink">
                    {item.title}
                  </p>
                </div>
                {item.stanceA && (
                  <p className="mb-1.5 line-clamp-2 text-xs text-ink-2">
                    “{item.stanceA}” vs “{item.stanceB}”
                  </p>
                )}
                <div className="flex items-center justify-between gap-2">
                  {item.sources[0] && (
                    <SourceChip
                      url={item.sources[0].url}
                      domain={item.sources[0].domain}
                      meta={item.sources[0].meta}
                    />
                  )}
                  <Link
                    href={`/compose?topic=${encodeURIComponent(item.title)}`}
                    className="shrink-0 text-xs font-medium text-ember hover:text-ember-hover"
                  >
                    Write about this
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="card-surface px-5 py-4">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function formatAge(hours: number): string {
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
