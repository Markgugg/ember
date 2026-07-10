"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { AiLine } from "@/components/ui/AiVoice";
import { useToast } from "@/components/ui/Toast";
import { useUiStore } from "@/stores/ui";
import { loadProfile, saveProfile } from "@/app/actions";

const field =
  "w-full rounded-[12px] border border-[rgb(27_36_48/0.1)] bg-white px-3.5 py-2.5 text-[13px] outline-none placeholder:text-ink-3 focus:border-accent";

/** Voice & profile — the only configuration surface. */
export function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen);
  const close = useUiStore((s) => s.closeSettings);
  const toast = useToast();

  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [audience, setAudience] = useState("");
  const [beats, setBeats] = useState<string[]>([]);
  const [newBeat, setNewBeat] = useState("");
  const [samples, setSamples] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    void loadProfile().then((p) => {
      if (p) {
        setDisplayName(p.displayName ?? "");
        setHeadline(p.headline ?? "");
        setAudience(p.audience ?? "");
        setBeats(p.beats);
        setSamples(p.voiceSamples.join("\n\n---\n\n"));
      }
      setLoaded(true);
    });
  }, [open, loaded]);

  const addBeat = () => {
    const beat = newBeat.trim();
    if (!beat || beats.length >= 8 || beats.includes(beat)) return;
    setBeats([...beats, beat]);
    setNewBeat("");
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveProfile({
        displayName,
        headline,
        audience,
        beats,
        voiceSamples: samples
          .split(/\n\s*---\s*\n/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 3),
      });
      toast({ message: "Saved." });
      close();
    } catch {
      toast({ message: "Couldn't save — try again.", tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={close} label="Voice and profile">
      <h2 className="mb-1 text-[17px] font-bold">Voice &amp; profile</h2>
      <p className="mb-5 text-[12.5px] text-ink-2">
        Who you are shapes what Current believes only you can credibly say.
      </p>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <Label>Your name</Label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Mark Guggenheim"
            className={field}
          />
        </div>
        <div>
          <Label>Who reads you?</Label>
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="founders and AI engineers"
            className={field}
          />
        </div>
      </div>

      <Label>Who you are</Label>
      <input
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        placeholder="CS student & co-founder — full-stack products"
        className={`${field} mb-3`}
      />

      <Label>The topics you&apos;d post about</Label>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {beats.map((beat) => (
          <span
            key={beat}
            className="inline-flex items-center gap-1 rounded-full bg-[rgb(10_102_194/0.08)] py-1 pl-2.5 pr-1.5 text-[12px] text-accent"
          >
            {beat}
            <button
              type="button"
              onClick={() => setBeats(beats.filter((b) => b !== beat))}
              aria-label={`Remove ${beat}`}
              className="rounded-full p-0.5 hover:bg-[rgb(10_102_194/0.14)]"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {beats.length < 8 && (
          <input
            value={newBeat}
            onChange={(e) => setNewBeat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addBeat();
              }
            }}
            onBlur={addBeat}
            placeholder="Add a topic…"
            aria-label="Add a topic"
            className="min-w-[110px] flex-1 rounded-full border border-dashed border-[rgb(27_36_48/0.16)] bg-transparent px-2.5 py-1 text-[12px] outline-none placeholder:text-ink-3 focus:border-accent"
          />
        )}
      </div>

      <Label>
        Posts that sound like you — separate with{" "}
        <code className="rounded bg-[rgb(27_36_48/0.06)] px-1">---</code>
      </Label>
      <textarea
        value={samples}
        onChange={(e) => setSamples(e.target.value)}
        placeholder={"The post you were proud of…\n\n---\n\nAnother one…"}
        aria-label="Voice sample posts"
        className={`${field} mb-1 min-h-[140px] resize-none`}
      />
      {samples.trim().length === 0 && (
        <AiLine size="sm" className="mb-4 text-ink-2">
          I&apos;ll write plainly until you show me your voice.
        </AiLine>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={saving || !loaded}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
      {children}
    </label>
  );
}
