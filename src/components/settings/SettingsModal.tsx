"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import { AiLine } from "@/components/ui/AiVoice";
import { useToast } from "@/components/ui/Toast";
import { useUiStore } from "@/stores/ui";
import { loadProfile, saveProfile } from "@/app/actions";

/**
 * F13-lite — the only configuration surface: voice samples + audience line.
 * Saves on demand; states its plain-voice fallback honestly when empty.
 */
export function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen);
  const close = useUiStore((s) => s.closeSettings);
  const toast = useToast();

  const [audience, setAudience] = useState("");
  const [samples, setSamples] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    void loadProfile().then((p) => {
      if (p) {
        setAudience(p.audience ?? "");
        setSamples(p.voiceSamples.join("\n\n---\n\n"));
      }
      setLoaded(true);
    });
  }, [open, loaded]);

  const save = async () => {
    setSaving(true);
    try {
      await saveProfile({
        audience,
        voiceSamples: samples
          .split(/\n\s*---\s*\n/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 3),
      });
      toast({ message: "Voice saved." });
      close();
    } catch {
      toast({ message: "Couldn't save — try again.", tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={close} label="Voice settings">
      <h2 className="mb-1 text-lg font-medium text-ink">Voice</h2>
      <p className="mb-5 text-sm text-ink-2">
        Paste 1–3 LinkedIn posts that sound like you, separated by{" "}
        <code className="rounded-sm bg-raised px-1">---</code>
      </p>

      <TextArea
        value={samples}
        onChange={(e) => setSamples(e.target.value)}
        placeholder={"The post you were proud of…\n\n---\n\nAnother one…"}
        className="mb-1 min-h-[160px]"
        aria-label="Voice sample posts"
      />
      {samples.trim().length === 0 && (
        <AiLine size="sm" className="mb-4 text-ink-2">
          I&apos;ll write plainly until you show me your voice.
        </AiLine>
      )}

      <label className="mb-1 mt-3 block text-xs uppercase tracking-wide text-ink-3">
        Who reads you?
      </label>
      <input
        value={audience}
        onChange={(e) => setAudience(e.target.value)}
        placeholder="founders and AI engineers"
        className="mb-6 w-full rounded-md border border-line bg-raised px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-line-strong focus:outline-none"
      />

      <div className="flex justify-end gap-2">
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
