"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Radio } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import { loadPulsePreview, saveProfile } from "@/app/actions";

/**
 * Taplio-style split onboarding, niched to ember:
 *  1. who you are (name, headline, audience)
 *  2. LinkedIn URL + voice sample (optional)
 *  3. live scan — ember pulls today's AI discourse while you watch
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

  // Step 3: kick off the live scan the moment it appears.
  useEffect(() => {
    if (step === 3 && pulse === null) {
      void loadPulsePreview().then(setPulse);
    }
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
    <div className="flex min-h-screen">
      {/* ── left: the form panel ─────────────────────────────────── */}
      <div className="flex w-full max-w-[560px] flex-col bg-raised px-10 py-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-ember font-serif text-base text-white">
              e
            </span>
            <span className="font-serif text-lg text-ink">ember</span>
          </div>
          <span className="text-sm text-ink-3">Step {step}/3</span>
        </div>

        <div className="flex flex-1 flex-col justify-center">
          {step === 1 && (
            <div className="animate-rise-in">
              <h1 className="mb-2 text-xl font-semibold text-ink">
                Who are you on LinkedIn?
              </h1>
              <p className="mb-6 text-sm text-ink-2">
                This frames every post preview and helps ember judge what only
                you can credibly say.
              </p>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-3">
                Your name
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Mark Guggenheim"
                className="mb-4 w-full rounded-md border border-line bg-raised px-3 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-ember focus:outline-none"
              />
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-3">
                Who you are — one or two sentences
              </label>
              <TextArea
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="CS student and co-founder building full-stack products with TypeScript and Next.js."
                className="mb-4 min-h-[90px] text-sm"
              />
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-3">
                Who reads you?
              </label>
              <input
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="founders and AI engineers"
                className="mb-8 w-full rounded-md border border-line bg-raised px-3 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-ember focus:outline-none"
              />
              <div className="flex justify-end">
                <Button onClick={() => setStep(2)}>Continue</Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-rise-in">
              <h1 className="mb-2 text-xl font-semibold text-ink">
                Connect your LinkedIn profile
              </h1>
              <p className="mb-6 text-sm text-ink-2">
                Your profile URL personalises post ideas and voice. Pasting one
                strong post you&apos;ve written teaches ember how you actually
                sound.
              </p>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-3">
                Profile URL <span className="normal-case">(optional)</span>
              </label>
              <input
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://www.linkedin.com/in/your-profile"
                className="mb-4 w-full rounded-md border border-line bg-raised px-3 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-ember focus:outline-none"
              />
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-3">
                A post that sounds like you{" "}
                <span className="normal-case">(optional)</span>
              </label>
              <TextArea
                value={voiceSample}
                onChange={(e) => setVoiceSample(e.target.value)}
                placeholder="Paste one LinkedIn post you were proud of…"
                className="mb-2 min-h-[110px] text-sm"
              />
              {voiceSample.trim().length === 0 && (
                <p className="mb-6 font-serif text-sm text-ink-2">
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
            <div className="animate-rise-in">
              <h1 className="mb-2 text-xl font-semibold text-ink">
                One last thing — ember is already working
              </h1>
              <p className="mb-6 text-sm text-ink-2">
                Scanning what the AI world is arguing about right now, so your
                first post has a live conversation to land in.
              </p>
              <div className="card-surface mb-8 p-5">
                <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-ink">
                  <Radio size={15} className="text-ember" aria-hidden />
                  While you wait, here&apos;s what&apos;s happening
                </p>
                {pulse === null ? (
                  <div className="flex flex-col gap-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="size-1.5 animate-ember-breathe rounded-full bg-ember" />
                        <div className="h-4 flex-1 rounded bg-accent-soft" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {pulse.map((p, i) => (
                      <div
                        key={i}
                        className="flex animate-rise-in items-start gap-3"
                      >
                        <Check
                          size={15}
                          className="mt-0.5 shrink-0 text-success"
                          aria-hidden
                        />
                        <div>
                          <p className="text-sm text-ink">{p.title}</p>
                          <p className="text-xs text-ink-3">{p.meta}</p>
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

      {/* ── right: the blue visual panel ─────────────────────────── */}
      <div className="relative hidden flex-1 overflow-hidden bg-gradient-to-br from-[#0a66c2] via-[#0b5cb0] to-[#083f78] lg:block">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-12">
          <h2 className="max-w-md text-center text-2xl font-semibold text-white">
            Write the posts <span className="text-[#bfdcf7]">only you</span>{" "}
            could have written
          </h2>
          <div className="glass-surface w-full max-w-md rounded-xl p-5">
            <p className="mb-1 font-serif text-sm text-white/90">
              You said “agents fail at handoff, not reasoning” on Tuesday —
            </p>
            <p className="font-serif text-sm text-white/90">
              today the internet started arguing about exactly that.
            </p>
          </div>
          <div className="glass-surface w-full max-w-md rounded-xl p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-white/25 text-sm font-semibold text-white">
                {(displayName || "Y")[0].toUpperCase()}
              </span>
              <div>
                <p className="text-sm font-semibold text-white">
                  {displayName || "You"}
                </p>
                <p className="text-xs text-white/70">now · LinkedIn</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="h-3 w-11/12 rounded bg-white/30" />
              <div className="h-3 w-full rounded bg-white/20" />
              <div className="h-3 w-4/5 rounded bg-white/20" />
              <div className="h-3 w-2/3 rounded bg-white/25" />
            </div>
          </div>
          <p className="text-xs text-white/60">
            your thinking × what the AI world is arguing about — live
          </p>
        </div>
      </div>
    </div>
  );
}
