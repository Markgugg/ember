/**
 * The AI's voice. These are the ONLY components allowed to render
 * AI-authored strings — serif is the strategist speaking, and keeping
 * the treatment behind components enforces the product rule that
 * no AI output ships without its visual signature (and no chrome
 * string ever borrows it).
 */

/** A line spoken by the AI. Serif, measured. Never render more than two consecutively outside the reasoning stream. */
export function AiLine({
  size = "lg",
  className = "",
  children,
}: {
  size?: "sm" | "base" | "lg" | "xl";
  className?: string;
  children: React.ReactNode;
}) {
  const sizes = {
    sm: "text-sm",
    base: "text-base",
    lg: "text-lg",
    xl: "text-xl",
  } as const;
  return (
    <p className={`font-serif ${sizes[size]} text-ink ${className}`}>
      <span className="sr-only">ember: </span>
      {children}
    </p>
  );
}

/** The because-line that accompanies every AI decision. Always em-dash prefixed. */
export function Rationale({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`font-serif text-sm text-ink-2 ${className}`}>
      <span className="sr-only">ember&apos;s reasoning: </span>— {children}
    </p>
  );
}
