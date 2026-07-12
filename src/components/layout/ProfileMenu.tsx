"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ExternalLink, RotateCcw, UserRound } from "lucide-react";
import { useUiStore } from "@/stores/ui";
import { useToast } from "@/components/ui/Toast";
import {
  linkedinAvailable,
  loadProfile,
  resetAccount,
  type ProfileView,
} from "@/app/actions";

/**
 * The avatar's dropdown — the product's account surface.
 *
 * It answers three questions the bare settings button never did: who does
 * Current think I am, is my LinkedIn attached, and how do I start over.
 * "Sign in with LinkedIn" doubles as sign-up: it verifies the member's real
 * name and unlocks posting, which is all the account this product needs.
 */
export function ProfileMenu({ initials }: { initials: string }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [liConfigured, setLiConfigured] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const openSettings = useUiStore((s) => s.openSettings);
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();

  useEffect(() => {
    if (!open || loaded) return;
    void Promise.all([loadProfile(), linkedinAvailable()]).then(
      ([p, available]) => {
        setProfile(p);
        setLiConfigured(available);
        setLoaded(true);
      },
    );
  }, [open, loaded]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    setOpen(!open);
    setConfirmingReset(false);
  };

  const startFresh = async () => {
    setResetting(true);
    try {
      await resetAccount();
      setOpen(false);
      setLoaded(false);
      setProfile(null);
      router.push("/welcome");
      router.refresh();
    } catch {
      toast({ message: "Couldn't reset — try again.", tone: "danger" });
    } finally {
      setResetting(false);
      setConfirmingReset(false);
    }
  };

  const connected = profile?.linkedinConnected ?? false;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[rgb(27_36_48/0.85)] text-[11.5px] font-semibold text-white transition-transform duration-200 hover:scale-105"
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="glass absolute right-0 top-[calc(100%+12px)] w-[290px] animate-spring-in rounded-[18px] p-2 shadow-[0_24px_60px_rgb(31_45_65/0.25)]"
          style={{ background: "rgb(255 255 255 / 0.92)" }}
        >
          {/* who Current thinks you are */}
          <div className="flex items-center gap-3 rounded-[13px] px-3 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[rgb(27_36_48/0.85)] text-[12px] font-semibold text-white">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-bold leading-tight">
                {loaded ? (profile?.displayName ?? "Guest") : "…"}
              </p>
              <p className="mt-0.5 truncate text-[11px] leading-tight text-ink-3">
                {loaded
                  ? (profile?.headline ??
                    "Your work lives in this browser.")
                  : ""}
              </p>
            </div>
          </div>

          {/* account state — verified or guest, said plainly */}
          {loaded && (
            <div className="mx-1 mb-1.5 rounded-[12px] bg-[rgb(10_102_194/0.06)] px-3 py-2.5">
              {connected ? (
                <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-ink-2">
                  <Check
                    size={13}
                    strokeWidth={2.5}
                    className="mt-px shrink-0 text-positive"
                    aria-hidden
                  />
                  LinkedIn connected. Posts publish through the official API,
                  as you.
                </p>
              ) : (
                <>
                  <p className="text-[11.5px] leading-snug text-ink-2">
                    {profile
                      ? "Not signed in — drafts stay here until you connect."
                      : "You're browsing as a guest."}
                  </p>
                  {liConfigured && (
                    <a
                      href={`/api/linkedin/connect?next=${encodeURIComponent(pathname)}`}
                      className="pill-primary mt-2 flex items-center justify-center px-3 py-2 text-[12px]"
                    >
                      Sign in with LinkedIn
                    </a>
                  )}
                  <p className="mt-1.5 text-[10.5px] leading-snug text-ink-3">
                    Verifies your real name and unlocks one-click and scheduled
                    posting.
                  </p>
                </>
              )}
            </div>
          )}

          <MenuItem
            icon={<UserRound size={14} aria-hidden />}
            label="Voice & profile"
            sub="Name, audience, topics, how you sound"
            onClick={() => {
              setOpen(false);
              openSettings();
            }}
          />
          {profile?.linkedinUrl && (
            <MenuItem
              icon={<ExternalLink size={14} aria-hidden />}
              label="My LinkedIn profile"
              href={profile.linkedinUrl}
            />
          )}

          <div aria-hidden className="mx-3 my-1.5 h-px bg-[rgb(27_36_48/0.08)]" />

          {confirmingReset ? (
            <div className="rounded-[12px] bg-[rgb(180_35_24/0.06)] px-3 py-2.5">
              <p className="text-[11.5px] font-semibold text-danger">
                Wipe everything and start over?
              </p>
              <p className="mt-0.5 text-[10.5px] leading-snug text-ink-3">
                Profile, conversations, angles, drafts — gone. Posts already on
                LinkedIn stay up.
              </p>
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => void startFresh()}
                  disabled={resetting}
                  className="rounded-full bg-danger px-3 py-1.5 text-[11.5px] font-semibold text-white transition-transform hover:scale-[1.03] disabled:opacity-60"
                >
                  {resetting ? "Wiping…" : "Yes, wipe it"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingReset(false)}
                  className="rounded-full bg-[rgb(27_36_48/0.06)] px-3 py-1.5 text-[11.5px] font-semibold"
                >
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <MenuItem
              icon={<RotateCcw size={14} aria-hidden />}
              label="Start fresh"
              sub="Wipe this browser's work, back to onboarding"
              danger
              onClick={() => setConfirmingReset(true)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  sub,
  href,
  danger = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  href?: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  const className = `flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left transition-colors hover:bg-[rgb(27_36_48/0.05)] ${
    danger ? "text-danger" : "text-ink"
  }`;
  const body = (
    <>
      <span className={`shrink-0 ${danger ? "text-danger" : "text-ink-3"}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-semibold leading-tight">
          {label}
        </span>
        {sub && (
          <span className="mt-0.5 block text-[10.5px] leading-tight text-ink-3">
            {sub}
          </span>
        )}
      </span>
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        role="menuitem"
        className={className}
      >
        {body}
      </a>
    );
  }
  return (
    <button type="button" role="menuitem" onClick={onClick} className={className}>
      {body}
    </button>
  );
}
