"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Ambient } from "@/components/layout/Ambient";
import { CurrentMark } from "@/components/layout/FloatingNav";
import { loadPulsePreview, saveProfile } from "@/app/actions";

const field =
  "w-full rounded-[12px] border border-[rgb(27_36_48/0.1)] bg-white px-3.5 py-2.5 text-[13px] outline-none placeholder:text-ink-3 focus:border-accent";

/**
 * Three steps, and the third is the honest version of every "calibrating our
 * AI…" screen: Current really does pull today's discourse while you watch.
 */
export default function Welcome() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [audience, setAudience] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [voiceSample, setVoiceSample] = useState("");

  const [pulse, setPulse] = useState<
    { title: string; meta: string; live: boolean }[] | null
  >(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (step === 3 && pulse === null) void loadPulsePreview().then(setPulse);
  }, [step, pulse]);

  const finish = async () => {
    setFinishing(true);
    try {
      await saveProfile({
        displayName,
        headline,
        audience,
        linkedinUrl,
        voiceSamples: voiceSample.trim() ? [voiceSample.trim()] : undefined,
      });
      router.push("/");
    } catch {
      setFinishing(false);
    }
  };

  return (
    <div className="relative flex min-h-screen overflow-hidden text-ink">
      <Ambient />

      {/* ── left: the form ───────────────────────────────────────── */}
      <div className="relative z-10 flex w-full flex-col px-10 py-8 lg:max-w-[560px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CurrentMark />
            <span className="text-[15px] font-semibold tracking-[-0.01em]">
              Current
            </span>
          </div>
          <span className="text-[13px] text-ink-3">Step {step}/3</span>
        </div>

        <div className="flex flex-1 flex-col justify-center">
          {step === 1 && (
            <div className="animate-fade-up">
              <h1 className="mb-2 text-[27px] font-bold tracking-[-0.02em]">
                Who are you on LinkedIn?
              </h1>
              <p className="mb-6 text-[13px] leading-relaxed text-ink-2">
                This frames every post preview, and it&apos;s how Current judges
                what only you can credibly say.
              </p>

              <Label>Your name</Label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Mark Guggenheim"
                className={`${field} mb-4`}
              />
              <Label>Who you are — a sentence or two</Label>
              <textarea
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="CS student and co-founder building full-stack products with TypeScript and Next.js."
                className={`${field} mb-4 min-h-[90px] resize-none`}
              />
              <Label>Who reads you?</Label>
              <input
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="founders and AI engineers"
                className={`${field} mb-8`}
              />

              <div className="flex justify-end">
                <Button onClick={() => setStep(2)}>Continue</Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-fade-up">
              <h1 className="mb-2 text-[27px] font-bold tracking-[-0.02em]">
                Connect your LinkedIn profile
              </h1>
              <p className="mb-6 text-[13px] leading-relaxed text-ink-2">
                Your profile URL personalises post ideas. Pasting one post
                you&apos;ve written teaches Current how you actually sound.
              </p>

              <Label>
                Profile URL <span className="normal-case">(optional)</span>
              </Label>
              <input
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://www.linkedin.com/in/your-profile"
                className={`${field} mb-4`}
              />
              <Label>
                A post that sounds like you{" "}
                <span className="normal-case">(optional)</span>
              </Label>
              <textarea
                value={voiceSample}
                onChange={(e) => setVoiceSample(e.target.value)}
                placeholder="Paste one LinkedIn post you were proud of…"
                className={`${field} mb-2 min-h-[110px] resize-none`}
              />
              {voiceSample.trim().length === 0 && (
                <p className="mb-6 font-serif text-[13px] text-ink-2">
                  I&apos;ll write plainly until you show me your voice.
                </p>
              )}

              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button onClick={() => setStep(3)}>Link my profile</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-fade-up">
              <h1 className="mb-2 text-[27px] font-bold tracking-[-0.02em]">
                Current is already working
              </h1>
              <p className="mb-6 text-[13px] leading-relaxed text-ink-2">
                Reading what the AI world is arguing about right now, so your
                first post has a live conversation to land in.
              </p>

              <div className="glass mb-8 rounded-[20px] px-[22px] py-[18px]">
                <p className="mb-4 flex items-center gap-2 text-[14px] font-bold">
                  <span
                    aria-hidden
                    className={`size-1.5 rounded-full bg-accent ${pulse === null ? "animate-pulse-dot" : ""}`}
                  />
                  {pulse === null
                    ? "Scanning today's feed…"
                    : "Here's what's happening"}
                </p>

                {pulse === null ? (
                  <div className="flex flex-col gap-3">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-4 animate-pulse rounded bg-[rgb(10_102_194/0.08)]"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {pulse.map((p, i) => (
                      <div key={i} className="flex animate-fade-up items-start gap-3">
                        <Check
                          size={15}
                          className="mt-0.5 shrink-0 text-positive"
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium leading-snug">
                            {p.title}
                          </p>
                          <p className="text-[11px] text-ink-3">{p.meta}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button
                  onClick={() => void finish()}
                  disabled={finishing || pulse === null}
                >
                  {finishing ? "Setting up…" : "Let's go"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── right: the glass showcase ────────────────────────────── */}
      <div
        className="relative hidden flex-1 items-center justify-center overflow-hidden lg:flex"
        style={{
          background:
            "linear-gradient(150deg, #0a66c2 0%, #0b5cb0 55%, #08417c 100%)",
        }}
      >
        <div className="flex w-full max-w-md flex-col items-center gap-6 px-12">
          <h2 className="text-center text-[27px] font-bold leading-tight tracking-[-0.02em] text-white">
            Write the posts{" "}
            <span className="text-[#bfdcf7]">only you</span> could have written
          </h2>

          <div
            className="w-full rounded-[20px] p-5"
            style={{
              background: "rgb(255 255 255 / 0.14)",
              backdropFilter: "blur(20px) saturate(1.6)",
              border: "1px solid rgb(255 255 255 / 0.24)",
            }}
          >
            <p className="font-serif text-[14px] leading-relaxed text-white/90">
              You said “agents fail at handoff, not reasoning” on Tuesday — today
              the internet started arguing about exactly that.
            </p>
          </div>

          <div
            className="w-full rounded-[20px] p-5"
            style={{
              background: "rgb(255 255 255 / 0.14)",
              backdropFilter: "blur(20px) saturate(1.6)",
              border: "1px solid rgb(255 255 255 / 0.24)",
            }}
          >
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-full bg-white/25 text-[13px] font-semibold text-white">
                {(displayName || "Y")[0].toUpperCase()}
              </span>
              <div>
                <p className="text-[13px] font-semibold text-white">
                  {displayName || "You"}
                </p>
                <p className="text-[11px] text-white/70">now · LinkedIn</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="h-2.5 w-11/12 rounded bg-white/30" />
              <div className="h-2.5 w-full rounded bg-white/20" />
              <div className="h-2.5 w-4/5 rounded bg-white/20" />
              <div className="h-2.5 w-2/3 rounded bg-white/25" />
            </div>
          </div>

          <p className="text-center text-[11.5px] text-white/60">
            live AI news × your conversations — posts only where they meet
          </p>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
      {children}
    </label>
  );
}
