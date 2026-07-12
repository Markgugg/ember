"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Ambient } from "@/components/layout/Ambient";
import { CurrentField } from "@/components/ui/current-field";
import { CurrentMark } from "@/components/layout/FloatingNav";
import {
  linkedinAvailable,
  loadProfile,
  loadPulsePreview,
  saveProfile,
  scanLinkedinProfile,
} from "@/app/actions";

const field =
  "w-full rounded-[12px] border border-[rgb(27_36_48/0.1)] bg-white px-3.5 py-2.5 text-[13px] outline-none placeholder:text-ink-3 focus:border-accent";

type Step = "connect" | "scanning" | "review";

interface Pulse {
  title: string;
  meta: string;
  live: boolean;
}

/**
 * Taplio-shaped onboarding, honest version:
 *  1. Connect — your LinkedIn URL, required to continue
 *  2. Scanning — really reads your profile (best-effort), really pulls
 *     today's AI discourse, really drafts your content profile
 *  3. Review — everything pre-filled and editable ("validate or update")
 */
export default function Welcome() {
  return (
    <Suspense>
      <WelcomeFlow />
    </Suspense>
  );
}

function WelcomeFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<Step>("connect");

  // step 1
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const urlValid = /linkedin\.com\/in\/[^/?#]+/i.test(linkedinUrl.trim());

  // OAuth: available to offer? already connected (verified name)?
  const [oauthAvailable, setOauthAvailable] = useState(false);
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  useEffect(() => {
    void linkedinAvailable().then(setOauthAvailable);
    if (params.get("linkedin") === "connected") {
      void loadProfile().then((p) => {
        if (p?.displayName) setVerifiedName(p.displayName);
        if (p?.linkedinUrl) setLinkedinUrl(p.linkedinUrl);
      });
    }
  }, [params]);

  // paste-your-profile: the honest way past LinkedIn's authwall
  const [pastedProfile, setPastedProfile] = useState("");
  const [redrafting, setRedrafting] = useState(false);

  // scanning progress (each flips true when its real work finishes)
  const [scanDone, setScanDone] = useState(false);
  const [pulseDone, setPulseDone] = useState(false);
  const [profileFetched, setProfileFetched] = useState(false);
  const [pulse, setPulse] = useState<Pulse[]>([]);

  // step 3 — the editable pre-fill
  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [audience, setAudience] = useState("");
  const [beats, setBeats] = useState<string[]>([]);
  const [newBeat, setNewBeat] = useState("");
  const [voiceSample, setVoiceSample] = useState("");
  const [finishing, setFinishing] = useState(false);

  // OAuth already told us who you are, so the URL becomes optional — it only
  // ever fed a name guess, and a verified name beats a guess.
  const canProceed = urlValid || Boolean(verifiedName);

  const startedScan = useRef(false);
  const startScan = () => {
    if (!canProceed) {
      setUrlError("Paste your linkedin.com/in/… profile URL to continue.");
      return;
    }
    setUrlError(null);
    setStep("scanning");
    if (startedScan.current) return;
    startedScan.current = true;

    void scanLinkedinProfile(
      urlValid ? linkedinUrl : "",
      undefined,
      verifiedName ?? undefined,
    )
      .then((scan) => {
        // A name verified through OAuth outranks one guessed from the URL.
        setDisplayName(verifiedName ?? scan.name);
        setHeadline(scan.headline);
        setAudience(scan.audience);
        setBeats(scan.beats);
        setProfileFetched(scan.profileFetched);
      })
      .catch(() => {
        setProfileFetched(false);
      })
      .finally(() => setScanDone(true));

    void loadPulsePreview()
      .then(setPulse)
      .finally(() => setPulseDone(true));
  };

  // scanning → review once both real jobs finish (plus a beat to read it)
  useEffect(() => {
    if (step === "scanning" && scanDone && pulseDone) {
      const t = setTimeout(() => setStep("review"), 900);
      return () => clearTimeout(t);
    }
  }, [step, scanDone, pulseDone]);

  /** Re-run the drafter with the member's own pasted profile text. */
  const [pasteFilled, setPasteFilled] = useState(false);
  const redraftFromPaste = async () => {
    if (pastedProfile.trim().length < 40) return;
    setRedrafting(true);
    try {
      // The URL may be empty when OAuth verified the member — pass the
      // verified name through or the action's validation rejects the call.
      const scan = await scanLinkedinProfile(
        urlValid ? linkedinUrl : "",
        pastedProfile,
        verifiedName ?? undefined,
      );
      setHeadline(scan.headline);
      setAudience(scan.audience);
      setBeats(scan.beats);
      if (!verifiedName && scan.name) setDisplayName(scan.name);
      setProfileFetched(true);
      setPasteFilled(true);
    } catch {
      setUrlError(null); // not a URL problem; keep the step calm
    } finally {
      setRedrafting(false);
    }
  };

  const finish = async () => {
    setFinishing(true);
    try {
      await saveProfile({
        displayName,
        headline,
        audience,
        linkedinUrl,
        beats,
        voiceSamples: voiceSample.trim() ? [voiceSample.trim()] : undefined,
      });
      router.push("/");
    } catch {
      setFinishing(false);
    }
  };

  const stepNumber = step === "connect" ? 1 : step === "scanning" ? 2 : 3;

  return (
    <div className="relative flex min-h-screen overflow-hidden text-ink">
      <Ambient />

      {/* ── left panel ───────────────────────────────────────────── */}
      <div className="relative z-10 flex w-full flex-col px-10 py-8 lg:max-w-[560px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CurrentMark />
            <span className="text-[15px] font-semibold tracking-[-0.01em]">
              Current
            </span>
          </div>
          <span className="text-[13px] text-ink-3">Step {stepNumber}/3</span>
        </div>

        <div className="flex flex-1 flex-col justify-center">
          {/* ── 1 · connect ─────────────────────────────────────── */}
          {step === "connect" && (
            <div className="animate-fade-up">
              <h1 className="mb-2 text-[27px] font-bold tracking-[-0.02em]">
                Connect your LinkedIn profile
              </h1>
              <p className="mb-6 text-[13px] leading-relaxed text-ink-2">
                Your profile URL lets Current draft your content profile for
                you — who you are, what you post about, who reads you. You
                review it, not type it.
              </p>

              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                Profile URL
              </label>
              <input
                value={linkedinUrl}
                onChange={(e) => {
                  setLinkedinUrl(e.target.value);
                  setUrlError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") startScan();
                }}
                placeholder="https://www.linkedin.com/in/your-profile"
                autoFocus
                className={`${field} mb-2`}
              />
              {urlError && (
                <p className="mb-2 text-[12px] font-medium text-danger">
                  {urlError}
                </p>
              )}
              <p className="mb-5 text-[11.5px] leading-relaxed text-ink-3">
                {verifiedName
                  ? "Optional now that LinkedIn verified you — add it if you want it on your profile."
                  : "Everything Current writes is anchored to a real person — the URL lets it draft your content profile for you."}
              </p>

              {verifiedName ? (
                <p className="mb-6 flex items-center gap-2 rounded-[12px] border border-[rgb(23_114_69/0.25)] bg-[rgb(23_114_69/0.07)] px-3.5 py-2.5 text-[12.5px] font-medium text-positive">
                  <BadgeCheck size={15} aria-hidden />
                  Verified as {verifiedName} — LinkedIn connected, posting
                  enabled.
                </p>
              ) : oauthAvailable ? (
                <div className="mb-6">
                  <a
                    href="/api/linkedin/connect?next=/welcome"
                    className="flex items-center justify-center gap-2 rounded-[12px] border border-[rgb(10_102_194/0.3)] bg-white px-4 py-2.5 text-[12.5px] font-semibold text-accent shadow-sm transition-transform hover:scale-[1.02]"
                  >
                    <BadgeCheck size={15} aria-hidden />
                    Sign in with LinkedIn to verify your name
                  </a>
                  <p className="mt-1.5 text-[11px] text-ink-3">
                    Optional now — it also turns on one-click posting later.
                  </p>
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                {/* Reviewers and the LinkedIn-shy get in without credentials:
                    a guest types a name on the next step and gets the whole
                    product except posting. No fake scan, no pretend step 2. */}
                <button
                  type="button"
                  onClick={() => setStep("review")}
                  className="text-[12px] font-medium text-ink-3 underline-offset-2 transition-colors hover:text-accent hover:underline"
                >
                  Just exploring? Continue as a guest
                </button>
                <Button onClick={startScan} disabled={!canProceed}>
                  {verifiedName && !urlValid ? "Continue" : "Link my profile"}
                </Button>
              </div>
            </div>
          )}

          {/* ── 2 · scanning ────────────────────────────────────── */}
          {step === "scanning" && (
            <div className="animate-fade-up">
              <h1 className="mb-2 text-[27px] font-bold tracking-[-0.02em]">
                Reading you in
              </h1>
              <p className="mb-6 text-[13px] leading-relaxed text-ink-2">
                While you wait, here&apos;s what&apos;s happening — all of it
                real.
              </p>

              <div className="glass rounded-[20px] px-[22px] py-[18px]">
                <div className="mb-1 h-1 w-full overflow-hidden rounded-full bg-[rgb(10_102_194/0.12)]">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-700"
                    style={{
                      width: `${20 + (scanDone ? 40 : 0) + (pulseDone ? 40 : 0)}%`,
                    }}
                  />
                </div>
                <div className="mt-4 flex flex-col gap-4">
                  <ScanRow
                    done={scanDone}
                    label="Scanning your LinkedIn profile"
                    sub={
                      !scanDone
                        ? "reading what your public page allows"
                        : profileFetched
                          ? "public page read — drafting from it"
                          : "LinkedIn blocks app reads — you'll paste your About next, it takes 5 seconds"
                    }
                  />
                  <ScanRow
                    done={pulseDone}
                    label="Checking what the AI world is arguing about"
                    sub={
                      pulseDone && pulse[0]
                        ? `live: “${pulse[0].title.slice(0, 60)}${pulse[0].title.length > 60 ? "…" : ""}”`
                        : "pulling today's feed from Hacker News"
                    }
                  />
                  <ScanRow
                    done={scanDone && pulseDone}
                    label="Drafting your content profile"
                    sub="who you are · your beats · your audience — all editable next"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── 3 · review ──────────────────────────────────────── */}
          {step === "review" && (
            <div className="animate-fade-up">
              <h1 className="mb-2 text-[27px] font-bold tracking-[-0.02em]">
                Review your profile
              </h1>
              <p className="mb-5 text-[13px] leading-relaxed text-ink-2">
                {profileFetched
                  ? "Validate or update what Current found. You can change all of it later in settings."
                  : "A starting draft — paste your profile below and Current will rewrite it from your real words."}
              </p>

              <div className="flex max-h-[58vh] flex-col gap-4 overflow-y-auto pr-1">
                {(!profileFetched || pasteFilled) && (
                  <ReviewCard title="Paste your About — Current fills out the rest">
                    <p className="mb-2.5 text-[12px] leading-relaxed text-ink-2">
                      LinkedIn blocks apps from reading profiles, so this is
                      the honest shortcut: copy your headline and About
                      section, drop it here, and everything below fills out
                      from your real words.
                    </p>
                    <textarea
                      value={pastedProfile}
                      onChange={(e) => setPastedProfile(e.target.value)}
                      placeholder="Paste your LinkedIn headline + About section…"
                      className={`${field} min-h-[86px] resize-none`}
                    />
                    <div className="mt-2.5 flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => void redraftFromPaste()}
                        disabled={redrafting || pastedProfile.trim().length < 40}
                        className="pill-primary px-4 py-2 text-[12px] disabled:opacity-45"
                      >
                        {redrafting ? "Filling it out…" : "Fill out the rest"}
                      </button>
                      {pasteFilled && !redrafting && (
                        <span className="flex items-center gap-1 text-[12px] font-medium text-positive">
                          <Check size={13} aria-hidden />
                          Filled from your words — review below.
                        </span>
                      )}
                    </div>
                  </ReviewCard>
                )}

                <ReviewCard title="Who you are">
                  <div className="relative mb-2">
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      className={field}
                    />
                    {verifiedName && displayName === verifiedName && (
                      <BadgeCheck
                        size={15}
                        aria-label="Verified through LinkedIn"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-positive"
                      />
                    )}
                  </div>
                  <textarea
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    className={`${field} min-h-[76px] resize-none`}
                  />
                </ReviewCard>

                <ReviewCard title="The topics you'd post about">
                  <div className="flex flex-wrap gap-2">
                    {beats.map((b) => (
                      <span
                        key={b}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(10_102_194/0.25)] bg-[rgb(10_102_194/0.07)] px-3 py-1.5 text-[12px] font-semibold text-accent"
                      >
                        {b}
                        <button
                          type="button"
                          aria-label={`Remove ${b}`}
                          onClick={() =>
                            setBeats(beats.filter((x) => x !== b))
                          }
                          className="text-[rgb(10_102_194/0.6)] hover:text-accent"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                    <input
                      value={newBeat}
                      onChange={(e) => setNewBeat(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newBeat.trim()) {
                          e.preventDefault();
                          if (!beats.includes(newBeat.trim())) {
                            setBeats([...beats, newBeat.trim()].slice(0, 8));
                          }
                          setNewBeat("");
                        }
                      }}
                      placeholder="+ add"
                      className="w-20 rounded-full border border-dashed border-[rgb(27_36_48/0.2)] bg-transparent px-3 py-1.5 text-[12px] outline-none placeholder:text-ink-3 focus:border-accent"
                    />
                  </div>
                </ReviewCard>

                <ReviewCard title="Who reads you">
                  <input
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    className={field}
                  />
                </ReviewCard>

                <ReviewCard title="A post that sounds like you — optional">
                  <textarea
                    value={voiceSample}
                    onChange={(e) => setVoiceSample(e.target.value)}
                    placeholder="Paste one LinkedIn post you were proud of…"
                    className={`${field} min-h-[70px] resize-none`}
                  />
                  {voiceSample.trim().length === 0 && (
                    <p className="mt-1.5 font-serif text-[12px] text-ink-2">
                      I&apos;ll write plainly until you show me your voice.
                    </p>
                  )}
                </ReviewCard>
              </div>

              <div className="mt-5 flex justify-between">
                <Button variant="ghost" onClick={() => setStep("connect")}>
                  Back
                </Button>
                <Button
                  onClick={() => void finish()}
                  disabled={finishing || !displayName.trim()}
                >
                  {finishing ? "Setting up…" : "Let's go"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── right: the blue showcase ─────────────────────────────── */}
      <div
        className="relative hidden flex-1 items-center justify-center overflow-hidden lg:flex"
        style={{
          background:
            "linear-gradient(150deg, #0a66c2 0%, #0b5cb0 55%, #08417c 100%)",
        }}
      >
        {/* Two wave sources, light only where they meet: the product's claim,
            drawn. Decorative, so it's aria-hidden inside the component. */}
        <CurrentField className="pointer-events-none absolute inset-0 h-full w-full" />

        {/* Just enough shadow under the copy to hold contrast over a node. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 46%, rgb(8 55 106 / 0.45) 0%, rgb(8 55 106 / 0.12) 45%, transparent 70%)",
          }}
        />

        <div className="relative flex w-full max-w-[560px] flex-col gap-4 px-10">
          <h2 className="mb-2 text-[31px] font-bold leading-[1.14] tracking-[-0.02em] text-white">
            Write the posts <span className="text-[#bfdcf7]">only you</span>{" "}
            could have written
          </h2>

          <div
            className="w-[86%] self-start rounded-[20px] p-5"
            style={{
              background: "rgb(255 255 255 / 0.14)",
              backdropFilter: "blur(20px) saturate(1.6)",
              border: "1px solid rgb(255 255 255 / 0.24)",
            }}
          >
            {step === "review" && pulse.length > 0 ? (
              <>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-white/70">
                  Live right now
                </p>
                <div className="flex flex-col gap-2.5">
                  {pulse.map((p, i) => (
                    <p
                      key={i}
                      className="font-serif text-[13px] leading-snug text-white/90"
                    >
                      {p.title}
                    </p>
                  ))}
                </div>
              </>
            ) : (
              <p className="font-serif text-[14px] leading-relaxed text-white/90">
                You said “agents fail at handoff, not reasoning” on Tuesday —
                today the internet started arguing about exactly that.
              </p>
            )}
          </div>

          {/* the intersection, drawn: two sources, light where they cross */}
          <div className="flex items-center gap-2.5 self-center py-0.5" aria-hidden>
            <span className="h-px w-16 bg-gradient-to-r from-transparent to-white/45" />
            <span className="relative flex h-8 w-11 items-center justify-center">
              <span className="absolute left-0 size-7 rounded-full border border-white/50" />
              <span className="absolute right-0 size-7 rounded-full border border-[#bfdcf7]/60" />
              <span className="size-1.5 rounded-full bg-white shadow-[0_0_14px_5px_rgb(255_255_255/0.55)]" />
            </span>
            <span className="h-px w-16 bg-gradient-to-l from-transparent to-white/45" />
          </div>

          <div
            className="w-[86%] self-end rounded-[20px] p-5"
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
                <p className="max-w-[240px] truncate text-[11px] text-white/70">
                  {headline || "now · LinkedIn"}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="h-2.5 w-11/12 rounded bg-white/30" />
              <div className="h-2.5 w-full rounded bg-white/20" />
              <div className="h-2.5 w-4/5 rounded bg-white/20" />
              <div className="h-2.5 w-2/3 rounded bg-white/25" />
            </div>
          </div>

          {/* the refusal — the part competitors don't have */}
          <div
            className="w-[72%] self-start rounded-[16px] px-4 py-3"
            style={{
              background: "rgb(8 40 76 / 0.32)",
              border: "1px dashed rgb(255 255 255 / 0.28)",
            }}
          >
            <p className="font-serif text-[12.5px] leading-snug text-white/80">
              And on the days nothing you&apos;ve said meets the moment, it
              writes nothing. That&apos;s the point.
            </p>
          </div>

          <p className="mt-1 self-center text-[11.5px] text-white/60">
            live AI news × your conversations — posts only where they meet
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── bits ─────────────────────────────────────────────────────────── */

function ScanRow({
  done,
  label,
  sub,
}: {
  done: boolean;
  label: string;
  sub: string;
}) {
  return (
    <div className="flex items-start gap-3">
      {done ? (
        <Check size={15} className="mt-0.5 shrink-0 text-positive" aria-hidden />
      ) : (
        <span
          aria-hidden
          className="mt-1 size-3 shrink-0 animate-spin-fast rounded-full border-2 border-[rgb(10_102_194/0.25)] border-t-accent"
        />
      )}
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-snug">{label}</p>
        <p className="text-[11.5px] text-ink-3">{sub}</p>
      </div>
    </div>
  );
}

function ReviewCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass animate-fade-up rounded-[18px] px-5 py-4">
      <p className="mb-2.5 text-[13px] font-bold">{title}</p>
      {children}
    </div>
  );
}
