import Link from "next/link";
import { AiLine } from "@/components/ui/AiVoice";

/**
 * F7 — the refusal, designed as carefully as success. Calm serif, zero error
 * styling, always ends in an invitation. A tool that declines to post is a
 * tool people believe.
 */
export function RefusalView({
  refusal,
}: {
  refusal: {
    closestMiss: string;
    reason: string;
    redirectTopic: string;
    redirectLine: string;
  };
}) {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center px-6 py-16">
      <AiLine size="xl" className="mb-6">
        Nothing here is worth your name on it today.
      </AiLine>

      {refusal.closestMiss && (
        <AiLine size="base" className="mb-10 text-ink-2">
          Closest miss: “{refusal.closestMiss}” — {refusal.reason}
        </AiLine>
      )}

      <AiLine size="lg" className="mb-8">
        {refusal.redirectLine}
      </AiLine>

      <div>
        <Link
          href={
            refusal.redirectTopic
              ? `/?topic=${encodeURIComponent(refusal.redirectTopic)}`
              : "/"
          }
          className="inline-flex h-10 items-center rounded-md bg-ember px-4 text-sm font-medium text-[#131110] transition-opacity duration-[120ms] hover:opacity-90"
        >
          Talk for two minutes
        </Link>
      </div>
    </div>
  );
}
