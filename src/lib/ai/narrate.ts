import "server-only";

/**
 * F8 — reasoning-stream line composition.
 * Template + slot, not an LLM call: these lines gate perceived latency, and
 * a 200ms template beats a 900ms haiku call that says the same thing.
 * The transcript fragment slot is what makes it feel alive.
 */

export type StageEvent =
  | { stage: "reading" }
  | { stage: "insights_found"; count: number; strongest: string }
  | { stage: "no_insights" }
  | { stage: "checking_discourse" }
  | { stage: "discourse_degraded" }
  | { stage: "discourse_fallback" }
  | { stage: "intersection_found"; title: string; meta: string }
  | { stage: "no_intersection" }
  | { stage: "drafting" }
  | { stage: "done"; briefId: string }
  | { stage: "error"; message: string };

export function narrate(event: StageEvent): string {
  switch (event.stage) {
    case "reading":
      return "Reading your thinking…";
    case "insights_found":
      return event.count === 1
        ? `Found one thing worth saying: “${trim(event.strongest)}”`
        : `Found ${event.count} things worth saying — strongest: “${trim(event.strongest)}”`;
    case "no_insights":
      return "Read it twice — nothing in here is a claim yet.";
    case "checking_discourse":
      return "Checking what the AI world is arguing about right now…";
    case "discourse_degraded":
      return "Couldn’t reach live news — working from your words alone.";
    case "discourse_fallback":
      return "Couldn’t reach today’s news — checking against the debates that never die instead.";
    case "intersection_found":
      return `This connects to the fight over ${trim(event.title, 70)} (${event.meta}).`;
    case "no_intersection":
      return "Nothing out there overlaps with this yet — judging it on its own.";
    case "drafting":
      return "Writing three angles, keeping the best…";
    case "done":
      return "Done.";
    case "error":
      return "I lost the thread. Your words are safe — try again?";
  }
}

function trim(s: string, n = 90): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length <= n ? clean : `${clean.slice(0, n - 1)}…`;
}
