/**
 * Local scheduler. In production Vercel Cron hits /api/cron/publish; on your
 * machine there is no cron, so when EMBER_DEV_SCHEDULER=1 we run the same two
 * jobs on an interval inside the server process:
 *
 *   1. publish any planned draft whose slot has come due (LinkedIn connected)
 *   2. refresh the AI news snapshot when it goes stale, pruning the old one
 *
 * Next calls register() once per server start.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.EMBER_DEV_SCHEDULER !== "1") return;

  const g = globalThis as typeof globalThis & { __currentScheduler?: boolean };
  if (g.__currentScheduler) return; // survive HMR
  g.__currentScheduler = true;

  const seconds = Math.max(15, Number(process.env.EMBER_SCHEDULER_INTERVAL ?? 60));
  const ttlMinutes = Number(process.env.EMBER_SNAPSHOT_TTL_MINUTES ?? 60);

  const tick = async () => {
    try {
      const { publishDue } = await import("@/lib/publish");
      const result = await publishDue();
      if (result.published > 0 || result.errors.length > 0) {
        console.log(
          `[scheduler] published ${result.published}, skipped ${result.skipped}` +
            (result.errors.length ? ` — errors: ${result.errors.join("; ")}` : ""),
        );
      }
    } catch (err) {
      console.error("[scheduler] publish failed:", err);
    }

    try {
      const { getRepo } = await import("@/lib/db");
      const { refreshSnapshot } = await import("@/lib/discourse");
      const repo = await getRepo();
      const existing = await repo.latestSnapshot();
      const stale =
        existing.length === 0 ||
        Date.now() - new Date(existing[0].snapshotAt).getTime() >
          ttlMinutes * 60 * 1000;
      if (stale) {
        const { items, live } = await refreshSnapshot(repo);
        console.log(
          `[scheduler] news refreshed: ${items.length} stories (${live ? "live" : "fallback"})`,
        );
      }
    } catch (err) {
      console.error("[scheduler] news refresh failed:", err);
    }
  };

  console.log(
    `[scheduler] on — checking due posts every ${seconds}s, news TTL ${ttlMinutes}m`,
  );
  setInterval(() => void tick(), seconds * 1000).unref?.();
  void tick();
}
