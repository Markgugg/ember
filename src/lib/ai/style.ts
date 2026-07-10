/**
 * Human-cadence enforcement.
 *
 * The draft prompt bans the punctuation that reads as machine-made, but a
 * prompt is a request, not a guarantee. `findStyleViolations` drives one
 * regeneration nudge; `sanitizePunctuation` is the deterministic backstop that
 * runs afterward, so an em dash can never reach a post no matter what the
 * model does.
 *
 * The dramatic colon is detected but never auto-rewritten: cutting it safely
 * needs to understand the clause, and a bad automatic rewrite is worse than
 * the colon. It only nudges a regeneration.
 */

/** Colon used as a drama beat at the start of a line ("The problem: nobody reads it."). */
const DRAMATIC_COLON = /^[^\n:]{3,48}:\s+\S/gm;

export function findStyleViolations(body: string): string[] {
  const out: string[] = [];
  if (/[—–]/.test(body)) out.push("em/en dash");
  if (/;/.test(body)) out.push("semicolon");
  if (DRAMATIC_COLON.test(body)) out.push("colon used for drama");
  DRAMATIC_COLON.lastIndex = 0; // global regex: reset between calls
  if (/\bIt'?s not about .+\.\s*It'?s about /i.test(body)) {
    out.push('"it\'s not about X, it\'s about Y"');
  }
  return out;
}

function capitalizeFirst(s: string): string {
  return s.replace(/^(\s*)([a-z])/, (_, ws: string, c: string) => ws + c.toUpperCase());
}

/**
 * A dash followed by one of these almost always joins two independent clauses
 * ("scale wins — I disagree"), where a comma would leave a splice. Anything
 * else is an interruption ("three things — logging, retries — before it ran"),
 * where a comma is right.
 */
const CLAUSE_STARTER =
  /^(I|We|You|They|He|She|It|That|This|There|Most|Everyone|Nobody|My|Our|Their|Then|Now)\b/;

/** "the integration surface is …" is a clause; "the good, the bad" is not. */
const DETERMINER_CLAUSE =
  /^(the|a|an)\s+[\w-]+(\s+[\w-]+)?\s+(is|isn't|was|wasn't|are|aren't|were|has|have|had|will|would|can|can't|could|does|doesn't|did|didn't|keeps|stays|breaks|wins|fails)\b/i;

/**
 * Guarantee no dash or semicolon survives into a post.
 * Semicolons always become sentence breaks. A dash becomes a period when it
 * joins two independent clauses, a comma when it interrupts one.
 */
export function sanitizePunctuation(body: string): string {
  let out = body;

  // "a; b" -> "a. B"
  out = out.replace(/\s*;\s*/g, ". ");

  // Trailing dash at end of a line has nothing to join.
  out = out.replace(/\s*[—–]\s*$/gm, ".");

  // Independent clause after the dash -> sentence break, else a comma. A
  // lookahead consumes nothing, so a second dash on the same line still gets
  // its own decision.
  out = out.replace(/\s*[—–]\s*(?=([^\n]+))/g, (_m, tail: string) =>
    CLAUSE_STARTER.test(tail) || DETERMINER_CLAUSE.test(tail) ? ". " : ", ",
  );
  // Any dash the lookahead couldn't classify (followed by a quote, digit, etc.)
  out = out.replace(/\s*[—–]\s*/g, ", ");

  // Sentence breaks we introduced need their next word capitalized.
  out = out.replace(/([.!?])\s+([a-z])/g, (_m, p: string, c: string) => `${p} ${c.toUpperCase()}`);

  // A comma directly before terminal punctuation is never right.
  out = out.replace(/,\s*([.!?])/g, "$1");
  // Doubled commas from adjacent dashes.
  out = out.replace(/,\s*,/g, ",");

  return capitalizeFirst(out);
}
