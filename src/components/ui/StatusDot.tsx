type Status = "neutral" | "success" | "caution" | "danger" | "ember";

const colors: Record<Status, string> = {
  neutral: "bg-ink-3",
  success: "bg-success",
  caution: "bg-caution",
  danger: "bg-danger",
  ember: "bg-ember",
};

/** 6px status dot. Color is never the sole signal — always pair with text or a label. */
export function StatusDot({
  status = "neutral",
  label,
  breathing = false,
}: {
  status?: Status;
  label?: string;
  breathing?: boolean;
}) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`inline-block size-1.5 shrink-0 rounded-full ${colors[status]} ${
        breathing ? "animate-ember-breathe" : ""
      }`}
    />
  );
}
