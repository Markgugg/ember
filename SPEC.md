# Ember — Implementation Specification

> You already said it. Ember listens to your thinking, watches what the AI world is arguing about, and writes the LinkedIn post where they meet.

This is the engineering contract for V1. Product blueprint, UX spec, and design system decisions are summarized where they constrain implementation; this document is optimized for building.

**Stack:** Next.js 15 (App Router) · TypeScript strict · Supabase (Postgres + Auth + pgvector) · Anthropic API · OpenAI Whisper (transcription) · Vercel (deploy + cron) · Tailwind (tokens from design system) · PostHog

---

## 1. Feature Breakdown

Features are ordered by build sequence. Each has acceptance criteria (AC). A feature is done when all AC pass.

### F1 — Auth & Onboarding
Google OAuth via Supabase Auth. Onboarding is one optional screen: LinkedIn URL (voice import, best-effort) + audience one-liner. Trying the product does not require sign-in; **saving** does (auth gate fires on first "keep this").

**AC:**
- [ ] New user reaches the home (record) screen in ≤ 2 clicks from landing.
- [ ] Skipping onboarding entirely still produces working sessions (neutral voice, generic audience).
- [ ] Anonymous user can run one full session; attempting to save/copy prompts sign-in without losing the generated brief (brief persisted to anon session, claimed on auth).
- [ ] Sign-in state survives refresh; sign-out clears client caches.

### F2 — Voice Capture & Transcription
Hero input is a record button (MediaRecorder → webm/opus). Paste and `.txt`/`.vtt` upload are secondary affordances. Audio posts to `/api/transcribe` → OpenAI Whisper → transcript text. Audio is **not stored** in V1; only the transcript persists.

**AC:**
- [ ] Record → stop → transcript lands in the pipeline with no user-visible intermediate screen; recording state shows elapsed time and a live level indicator.
- [ ] 2-minute recording transcribes in < 15s p95.
- [ ] Mic permission denied → inline fallback message surfaces paste/upload; no dead end.
- [ ] `.vtt` upload strips timestamps/speaker tags before pipeline entry.
- [ ] Transcript < ~150 words → soft warning line (serif, caution) but submission is never blocked.

### F3 — Insight Mining
One structured Anthropic call (claude-sonnet-5, tool-forced JSON) extracts 0–6 insights from a transcript. Each: `text` (the claim, one sentence), `quote` (verbatim supporting excerpt), `type` (`opinion | story | lesson`), `authority` (0–1: firsthand evidence heuristic), `charge` (0–1: emotional/contrarian energy). Insights are embedded (OpenAI `text-embedding-3-small`) and upserted with dedupe: cosine > 0.92 against user's existing insights → merge (bump `last_seen_at`, increment `recurrence`), don't duplicate.

**AC:**
- [ ] Every insight's `quote` is a verbatim substring of the transcript (validated server-side; non-substring quotes reject the insight, not the batch).
- [ ] Re-submitting the same transcript creates zero new insight rows (dedupe path proven by test).
- [ ] A transcript with no defensible claims yields an empty array, not hallucinated insights (tested with a fixture of pure logistics talk).
- [ ] Recurrence counter increments when a semantically-equivalent insight arrives from a different transcript.

### F4 — Discourse Snapshot Service
Vercel cron (every 3h) pulls: Hacker News front page + best (Algolia API, free), 4–6 AI RSS feeds (config array), and clusters into 5–10 discourse items via one claude-haiku-4-5 call. Each item: `title`, `summary`, `stance_a`/`stance_b` (the tension, nullable), `velocity` (comment count / recency composite), `sources[]` (url, domain, age), embedding. Snapshot stored as rows; latest snapshot is what the app reads.

**AC:**
- [ ] Cron completes in < 60s; failure leaves the previous snapshot intact and readable (never an empty state from a failed pull).
- [ ] Every discourse item carries ≥ 1 source URL that resolves (checked at ingest).
- [ ] Snapshot age is exposed to the pipeline; items > 48h old are excluded from intersection.
- [ ] Feed list is editable via env/config without code change.

### F5 — Intersection Engine
The core. For a given user: prefilter by embedding cosine (insights × latest discourse items, threshold 0.75), then a single claude-sonnet-5 judge call scores surviving pairs: `intersection_score` (0–1) + one-sentence `rationale`. Composite ranking: `authority × novelty × velocity × intersection_score`, with a differentiation penalty (cosine vs. user's posted drafts). Top pair wins. **No pair ≥ threshold (0.6) → refusal path (F7).**

**AC:**
- [ ] Judge call receives ≤ 12 candidate pairs (prefilter proven to cap fan-out).
- [ ] Every returned intersection includes a rationale naming both the insight and the discourse item; rationale renders verbatim in the Brief.
- [ ] A trend with no matching insight can never produce a post (unit test: empty vault + hot snapshot → refusal with redirect, zero drafts).
- [ ] Differentiation penalty proven: an insight semantically matching an already-posted draft ranks below a fresh insight of equal raw score.

### F6 — Brief Generation (one post, hidden alternates)
For the winning intersection: one claude-sonnet-5 call generates **three** angled drafts (angle chosen by rule from insight type — story→story, contrarian charge→contrarian, method→framework, etc.) with embedded self-critique, picks a primary, and returns per-draft rationale + a recommendation sentence. UI shows the primary only; alternates behind a collapsed "two other angles didn't make the cut."

**AC:**
- [ ] Primary draft is < 2,000 chars, has a first-line hook ≤ 120 chars, contains zero em-dash-free AI-tells from the banned-phrase list (`banned_phrases.ts`: "delve", "game-changer", "in today's fast-paced world", etc. — list checked server-side, violations trigger one regeneration).
- [ ] Each draft's rationale references the specific insight or discourse fact it's built on (no generic "this is engaging").
- [ ] Draft body quotes or paraphrases only claims present in the transcript or snapshot (spot-check eval set; see §12).
- [ ] Expanding alternates requires exactly one interaction; the choice is remembered per-brief.

### F7 — Refusal State
When F5 clears nothing: render the refusal — closest-miss insight with the honest reason, plus the redirect ("everyone's arguing about X, your lane — talk for two minutes") pre-tagging a new session with that topic.

**AC:**
- [ ] Refusal names the closest miss and a concrete reason (e.g., saturation), both AI-generated per-session, never canned strings.
- [ ] Redirect button starts a recording session carrying the topic as context; the resulting pipeline run biases intersection toward that discourse item.
- [ ] Refusal renders with zero error styling; PostHog event `refusal_shown` distinguishes it from pipeline failures.

### F8 — Reasoning Stream
`/api/session` is a POST returning SSE. Server emits one event per real pipeline stage (`reading`, `insights_found`, `checking_discourse`, `intersection_found` | `no_intersection`, `drafting`); client renders the serif stream per design spec. Event payloads carry the display line already composed server-side (one claude-haiku-4-5 microcall per line, ≤ 20 tokens, or template+slot for latency-critical lines).

**AC:**
- [ ] Lines appear only when their stage truly completes (no timed fakes); total pipeline p95 < 40s.
- [ ] At least one line quotes a fragment of the user's own transcript verbatim.
- [ ] Connection drop mid-stream → client reconnects with `session_id` and receives terminal state (pipeline result is persisted independent of the stream).
- [ ] Feed-fetch degradation emits the honest caution line and the pipeline continues transcript-only.

### F9 — Proactive Pre-Run ("While you were out")
Second Vercel cron (after each snapshot): for each active user (session in last 14 days), run F5 against their vault. Score ≥ 0.75 → generate the brief, store with `origin='prerun'`. Home screen renders it as the arrival state. Max 1 unconsumed pre-run brief per user (new one replaces old).

**AC:**
- [ ] User with a vaulted insight matching fresh discourse opens the app to a fully-formed brief with the "while you were out" framing — zero input.
- [ ] Dismissing a pre-run brief returns the insight to the vault unharmed and suppresses re-runs on that insight×item pair.
- [ ] Pre-run respects the same refusal threshold (no forced daily content; silence is a valid output).
- [ ] Cron cost-bounded: skips users with no new snapshot overlap (embedding prefilter, no LLM call).

### F10 — Publish Flow
Copy button (clipboard API) + "open LinkedIn →" (share composer deep-link `linkedin.com/feed/?shareActive=true`... V1: plain feed link). Copy **or** deep-link click sets draft `status='posted'` (assumed, reversible in Library). No LinkedIn API integration in V1.

**AC:**
- [ ] Copy preserves line breaks exactly as LinkedIn renders them (no markdown artifacts).
- [ ] No confirmation question is ever shown post-copy; status flips silently and is undoable from Library.
- [ ] `post_copied` PostHog event fires with brief_id, angle, origin (session|prerun) — this is the product's north-star metric.

### F11 — Inline Edit & "Not my voice"
Draft body is contentEditable in place. One ghost action on the card: **Not my voice** → regenerates the draft (same angle, same facts) with voice samples re-weighted; streams into place. Edits are diffed and stored (V2 voice-learning fuel).

**AC:**
- [ ] Edit → copy round-trip never loses user text (autosave on blur + before copy).
- [ ] "Not my voice" preserves all factual content (claim set identical before/after — eval-checked) while changing register.
- [ ] Edited drafts are marked `status='edited'`; diff persisted.

### F12 — Library
Flat reverse-chron insight list. Row: status dot, text, recurrence badge (if > 1), relevance glint (computed lazily on page load: vault embeddings × latest snapshot, top 3 only), hover "Write this now →" (jumps straight to F5 with that insight pinned). Expandable to show associated drafts. Session as an object does not exist in the UI.

**AC:**
- [ ] Library open with 200 insights renders in < 500ms (glint computation is a single batched query, no per-row calls).
- [ ] "Write this now" produces a brief without a new transcript; reasoning stream reflects the skipped stage honestly ("Starting from something you said Oct 12…").
- [ ] Glint absence on compute failure is silent (no error state).
- [ ] Delete insight = undo-toast (5s), hard-deletes after; no confirm modal.

### F13 — Voice Settings (modal)
LinkedIn URL, audience line, voice samples (paste fallback — LinkedIn post import is **best-effort**: attempt public-profile fetch server-side; on failure show paste field with honest copy). Delete-everything with typed confirm.

**AC:**
- [ ] Missing voice samples → the system states its plain-voice fallback in one serif line, everywhere voice would apply.
- [ ] Delete-everything cascades: insights, briefs, drafts, transcripts, profile — verified empty by test.
- [ ] LinkedIn import failure degrades to paste without an error tone (LinkedIn blocks most unauthenticated scraping; treat success as bonus).

---

## 2. Routes

```
app/
  page.tsx                    /            Home: pre-run brief (if any) | record
  brief/[id]/page.tsx         /brief/:id   Brief (also renders refusal variant)
  library/page.tsx            /library
  auth/callback/route.ts                   Supabase OAuth callback
  api/
    transcribe/route.ts       POST audio → { transcript }        (edge-incompatible: node runtime)
    session/route.ts          POST { transcript | insight_id, topic_hint? } → SSE
    cron/discourse/route.ts   GET  (Vercel cron, CRON_SECRET header)
    cron/prerun/route.ts      GET  (Vercel cron, CRON_SECRET header)
```

Settings is a modal (intercepted route `@modal/(.)voice` or client state — client state is fine, don't over-route). Onboarding is `/welcome`, redirect-once via profile flag.

## 3. Component Inventory

Per design system: ~12 primitives + 2 bespoke. `components/ui/`: `Button` (primary|ghost|danger), `TextArea`, `Card`, `Chip`, `SourceChip`, `Toast`, `Modal`, `Menu`, `StatusDot`, `Tabs` (unused in V1 — do not build until needed). Bespoke: `Reasoning` (SSE consumer, owns stream layout + ember dot), `Rationale` (serif because-line; the only way rationale text may be rendered). Feature components: `Recorder`, `BriefView`, `DraftCard`, `RefusalView`, `InsightRow`, `PrerunHero`.

Design tokens live in `styles/tokens.css` (CSS custom properties, values from design system §1–§6) consumed by Tailwind config. Serif = AI-authored strings only; enforced by convention: AI strings render exclusively through `Reasoning`/`Rationale`/`AiLine` components.

## 4. Backend Services (lib/)

```
lib/
  ai/
    anthropic.ts        client, model constants (SONNET='claude-sonnet-5', HAIKU='claude-haiku-4-5-20251001')
    mine.ts             F3 — insight extraction (tool-forced JSON + substring validation)
    judge.ts            F5 — intersection scoring
    draft.ts            F6 — angle selection + generation + self-critique + banned-phrase gate
    narrate.ts          F8 — stream line composition
    embeddings.ts       OpenAI embedding wrapper, batch-first
  discourse/
    sources.ts          HN Algolia + RSS pull (config-driven feed list)
    cluster.ts          F4 — haiku clustering into discourse items
  pipeline/
    run.ts              orchestrates F3→F5→F6, emits stage events, persists at each stage
    score.ts            composite ranking + differentiation penalty (pure functions — unit-test home)
    refusal.ts          closest-miss + redirect composition
  db/                   typed query layer over supabase-js (no raw supabase calls in components)
```

Every AI call: zod-parsed output, one retry on parse failure, then graceful stage-level degradation. All prompts in `lib/ai/prompts/` as versioned template files — prompts are code, they get reviewed like code.

## 5. Database Schema (Supabase / Postgres + pgvector)

```sql
profiles       (id uuid PK = auth.users.id, audience text, linkedin_url text,
                voice_samples jsonb default '[]', onboarded_at timestamptz)

transcripts    (id uuid PK, user_id uuid FK, source text check in (voice,paste,upload),
                raw_text text, word_count int, created_at timestamptz)

insights       (id uuid PK, user_id uuid FK, transcript_id uuid FK,
                text text, quote text, type text check in (opinion,story,lesson),
                authority real, charge real, recurrence int default 1,
                status text default 'vaulted' check in (vaulted,drafted,posted),
                embedding vector(1536), last_seen_at timestamptz, created_at timestamptz)

discourse_items(id uuid PK, snapshot_at timestamptz, title text, summary text,
                stance_a text, stance_b text, velocity real,
                sources jsonb, embedding vector(1536))

briefs         (id uuid PK, user_id uuid FK, insight_id uuid FK,
                discourse_item_id uuid FK null,          -- null = transcript-only degraded run
                intersection_score real, intersection_rationale text,
                recommendation text, origin text check in (session,prerun,library),
                status text default 'suggested' check in (suggested,consumed,dismissed,refused),
                created_at timestamptz)

drafts         (id uuid PK, brief_id uuid FK, angle text, rationale text, body text,
                is_primary bool, status text default 'suggested'
                  check in (suggested,edited,copied,posted),
                edit_diff jsonb null, created_at timestamptz)

prerun_suppressions (user_id uuid, insight_id uuid, discourse_item_id uuid,
                     PK (user_id, insight_id, discourse_item_id))
```

RLS on every user-owned table (`user_id = auth.uid()`); `discourse_items` is read-all. Indexes: ivfflat on both embedding columns; `insights (user_id, status)`; `briefs (user_id, status, origin)`. Migrations via supabase CLI, checked in under `supabase/migrations/`.

## 6. AI Pipelines (model routing & cost)

| Stage | Model | Est. tokens/run | Notes |
|---|---|---|---|
| Transcription | whisper-1 | — | ~$0.006/min audio |
| Insight mining | claude-sonnet-5 | ~3k in / 800 out | quality-critical |
| Embeddings | text-embedding-3-small | — | batched, ~free |
| Discourse cluster (cron) | claude-haiku-4-5 | ~8k in / 1.5k out | 8 runs/day total, shared |
| Intersection judge | claude-sonnet-5 | ~2k in / 400 out | prefilter caps input |
| Draft generation | claude-sonnet-5 | ~3k in / 2k out | 3 drafts + critique, one call |
| Stream narration | claude-haiku-4-5 | ~1.5k in / 100 out | or templates where latency-critical |

≈ $0.10–0.15 per full session. Pre-run cron cost bounded by embedding prefilter (LLM only on cosine hits).

## 7. State Management

Server Components + Server Actions for everything CRUD; the only rich client state is the live session. `TanStack Query` for Library/Brief reads (cache invalidation on mutation). One `zustand` store, scoped to the active session: `recorderState`, `streamEvents[]`, `briefId`. No global app store — if a second zustand store gets proposed, the answer is React Query. URL is state for brief/library (shareable, refresh-safe).

## 8. Authentication

Supabase Auth, Google provider only (audience = the user we already know exists). `@supabase/ssr` middleware for token refresh. Anonymous-session flow: pipeline runs keyed to a signed cookie `anon_id`; on sign-in, a claim mutation reassigns `anon_id` rows to `auth.uid()`. API routes verify JWT server-side; cron routes verify `CRON_SECRET`. No other roles, no orgs, no RBAC — V1 has exactly one persona.

## 9. Caching

- **Discourse snapshot:** the DB *is* the cache (latest rows; app never fetches feeds at request time).
- **Embeddings:** content-hash keyed — never re-embed identical text.
- **Next.js:** brief/library pages `dynamic` (user data); marketing/landing static. `unstable_cache` around snapshot read, 15-min revalidate, tag-invalidated by the cron.
- **LLM:** Anthropic prompt caching on the static system-prompt prefix of mine/judge/draft calls (system prompts are long and stable — this roughly halves input cost).

## 10. Analytics (PostHog)

North star: `post_copied`. Funnel: `session_started` → `transcript_captured` (props: source, word_count) → `insights_mined` (count) → `intersection_found` | `refusal_shown` → `brief_viewed` → `post_copied` → `marked_posted`. Plus: `prerun_consumed` / `prerun_dismissed` (proactive-feature verdict), `not_my_voice_used`, `alternate_expanded` (validates the one-post decision — if > 40% expand, the primary-pick model is wrong), pipeline stage latencies as event props. Session replay off (transcripts are private thinking; don't record them into a third-party tool).

## 11. Background Jobs

Vercel Cron: `0 */3 * * *` discourse snapshot; `20 */3 * * *` pre-run sweep (offset so it reads the fresh snapshot). Both idempotent, both bounded (< 60s / < 300s), both alarm to a Slack webhook on failure. No queue infrastructure in V1 — if a job outgrows cron limits, that's a V2 problem (Inngest/QStash), not a day-one dependency.

## 12. Testing Strategy

- **Unit (Vitest):** `score.ts` composite ranking + differentiation penalty; quote-substring validator; banned-phrase gate; vtt parser; dedupe threshold logic. These are the correctness core and they're all pure functions on purpose.
- **Integration:** pipeline run against **recorded AI fixtures** (each `lib/ai/*` call has a fixture mode keyed by content hash) — tests the orchestration, persistence, and SSE event order without model nondeterminism or cost.
- **E2E (Playwright):** the one path that matters — paste sample transcript → stream renders ≥ 4 lines → brief shows one post + rationale → copy → clipboard content matches body. Runs on fixtures. Second E2E: refusal path.
- **Evals (the tests that matter for an AI product):** `evals/` — 12 fixture transcripts with hand-labeled expected insights (precision/recall on mining), 6 intersection cases with expected match/no-match, hallucination check (every draft claim traceable to transcript or snapshot — LLM-judged with haiku, run on every prompt change). Evals run in CI on `lib/ai/prompts/**` diffs; a prompt change that drops mining F1 below baseline fails the build.
- **Keyboard path** (⌘Enter → C to copy) asserted in E2E — it's the demo.

## 13. Deployment

Vercel, two environments: `main` → production, PRs → preview deployments (Supabase branch DB per preview via supabase branching, or a shared staging project if branching is unavailable on plan). Env vars: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_*`, `CRON_SECRET`, `POSTHOG_KEY`, `DISCOURSE_FEEDS`. CI (GitHub Actions): typecheck, lint, unit + integration, evals-on-prompt-change, Playwright on preview URL. Node runtime (not edge) for AI routes — SSE + long calls. `maxDuration: 120` on `/api/session`.

## 14. Build Order

1. Repo scaffold, tokens.css, Supabase project + schema + RLS (day 1)
2. F4 discourse cron — it needs to accumulate data while everything else is built (day 1)
3. F2 capture → F3 mining → F5 intersection → F6 brief, wired through F8 SSE (the spine; days 2–4)
4. F7 refusal, F10 publish, F12 library (day 5)
5. F1 auth + anon-claim, F13 settings (day 6)
6. F9 pre-run, F11 not-my-voice, evals, polish (day 7+)

The spine (step 3) is demoable by itself — everything after it is compounding, not blocking.
