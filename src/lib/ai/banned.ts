/**
 * AI-tell phrases that must never appear in a draft (F6 AC).
 * Checked server-side after generation; a violation triggers one regeneration,
 * then hard-fails the draft rather than shipping slop.
 */
export const BANNED_PHRASES = [
  "delve",
  "game-changer",
  "game changer",
  "in today's fast-paced world",
  "in today's digital age",
  "the landscape of",
  "revolutionize",
  "unlock the power",
  "harness the power",
  "let that sink in",
  "it's not about",
  "here's the kicker",
  "buckle up",
  "dive deep",
  "deep dive into",
  "elevate your",
  "supercharge",
  "in the ever-evolving",
  "seamlessly",
  "🚀",
] as const;

export function findBannedPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_PHRASES.filter((p) => lower.includes(p));
}
