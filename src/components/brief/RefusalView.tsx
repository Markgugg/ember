import { AiLine } from "@/components/ui/AiVoice";
import { ComposeLink } from "@/components/composer/ComposeLink";

/**
 * The refusal, designed as carefully as success. Calm, zero error styling,
 * always ends in an invitation. A tool that declines to post is a tool people
 * believe when it doesn't.
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
    <div className="mx-auto flex min-h-screen w-full max-w-[640px] animate-fade-up flex-col justify-center px-8 py-16">
      <div className="glass rounded-[26px] px-10 py-12">
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

        <div className="flex gap-3">
          <ComposeLink
            seg="transcript"
            className="pill-primary inline-flex items-center px-5 py-2.5 text-[13px]"
          >
            Bring a conversation
          </ComposeLink>
          <ComposeLink
            seg="news"
            className="inline-flex items-center rounded-full bg-[rgb(27_36_48/0.06)] px-5 py-2.5 text-[13px] font-semibold transition-colors hover:bg-[rgb(27_36_48/0.12)]"
          >
            Pick another story
          </ComposeLink>
        </div>
      </div>
    </div>
  );
}
