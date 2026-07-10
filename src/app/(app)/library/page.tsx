import Link from "next/link";
import { Library as LibraryIcon } from "lucide-react";
import { getRepo } from "@/lib/db";
import { getUserId } from "@/lib/identity";
import { StatusDot } from "@/components/ui/StatusDot";
import { Rationale } from "@/components/ui/AiVoice";

export const dynamic = "force-dynamic";

/** Requirement 2's memory: every claim ember has mined from your thinking. */
export default async function LibraryPage() {
  const repo = await getRepo();
  const userId = await getUserId();
  const insights = await repo.listInsights(userId);

  return (
    <div className="mx-auto max-w-[900px] px-8 py-8">
      <div className="mb-1 flex items-center gap-2">
        <LibraryIcon size={18} className="text-ember" aria-hidden />
        <h1 className="text-xl font-semibold text-ink">Library</h1>
      </div>
      <p className="mb-6 text-sm text-ink-2">
        Everything worth saying that ember has mined from your transcripts.
        Unposted thinking waits here for its moment.
      </p>

      {insights.length === 0 ? (
        <div className="card-surface p-10 text-center">
          <p className="mb-2 text-sm text-ink-2">
            Your thinking lives here once you&apos;ve had some.
          </p>
          <Link
            href="/compose"
            className="text-sm font-medium text-ember hover:text-ember-hover"
          >
            Drop a transcript →
          </Link>
        </div>
      ) : (
        <div className="card-surface divide-y divide-line">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className="group flex items-center gap-4 px-5 py-4"
            >
              <StatusDot
                status={insight.status === "posted" ? "success" : "neutral"}
                label={insight.status}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{insight.text}</p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
                  <span className="capitalize">{insight.type}</span>
                  {insight.recurrence > 1 && (
                    <span className="rounded-full bg-accent-soft px-1.5 py-0.5 font-medium text-ember">
                      said {insight.recurrence}×
                    </span>
                  )}
                  <span>{new Date(insight.lastSeenAt).toLocaleDateString()}</span>
                  <span className="capitalize">· {insight.status}</span>
                </div>
              </div>
              {insight.status !== "posted" && (
                <Link
                  href={`/compose?insight=${insight.id}`}
                  className="shrink-0 text-sm font-medium text-ember opacity-0 transition-opacity duration-[120ms] hover:text-ember-hover focus-visible:opacity-100 group-hover:opacity-100"
                >
                  Write this now →
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {insights.length > 0 && (
        <Rationale className="mt-4">
          an insight that recurs across transcripts is a belief — those make
          the strongest posts.
        </Rationale>
      )}
    </div>
  );
}
