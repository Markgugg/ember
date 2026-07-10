# Current

**Posts powered by what's current.**

Current reads what the AI world is arguing about right now, mines the claims out of the conversations you actually had, and writes the LinkedIn post where the two meet.

It only writes when they meet. If nothing you've said connects to what the world is arguing about, Current tells you so instead of inventing an opinion for you.

## The two sources

**Today in AI** — a live feed pulled from Hacker News at request time (front page + the last 24 hours of AI stories, ranked by engagement). With an Anthropic key, stories are clustered into *tensions*: one side vs the other. Refreshes every few minutes.

**Your voice** — meetings, podcasts, voice memos, customer calls. Paste, upload, or record. Current mines each conversation into *angles*: the claims you made, quoted verbatim from your own words.

**The composer blends them.** Three modes:

| Mode | What it does |
|---|---|
| **From the news** | Pin a story. Current finds which of your banked claims meets it — or refuses. |
| **From a transcript** | Bring a conversation. Current finds the claim worth posting, and the live hook for it. |
| **Blend both** | A story *and* a conversation, pinned together. The intersection, on purpose. |

## Run it

```bash
npm install
npm run dev        # → http://localhost:3003
```

The port is pinned to 3003 because the LinkedIn app's OAuth redirect URL is
registered against it — on a fresh machine `next dev` would otherwise grab
3000 and the "Sign in with LinkedIn" round-trip would fail.

**Zero keys required.** With no `.env.local`, Current runs in fixture mode: deterministic heuristic mining and embedding-based matching, backed by an in-memory store. The news feed is **live either way** — the Hacker News pull needs no key. The whole loop works, including the refusal.

To go further, copy `.env.example` → `.env.local`:

| Key | Required? | Unlocks |
|---|---|---|
| `ANTHROPIC_API_KEY` | **for real writing** | insight mining, tension clustering, intersection judging, draft writing, voice rewrite, profile scan. Current runs fully on this key alone. |
| `OPENAI_API_KEY` | optional | real embeddings (better matching than the local fallback) + Whisper for the mic button and audio uploads |
| `LINKEDIN_CLIENT_ID` / `SECRET` | optional | one-click and scheduled posting — see below |
| `NEXT_PUBLIC_SUPABASE_URL` + keys | optional | persistent Postgres storage (run the migrations in `supabase/migrations/`) |

Two independent fallbacks, so partial setup degrades gracefully rather than
all-or-nothing: without Anthropic the *language* is heuristic; without OpenAI
the *vectors* are a local bag-of-words. Neither one blocks the other.

```bash
npm test           # unit tests: provenance gate, scoring, banned phrases
npm run build      # production build
```

### Moving to another machine

Two files are gitignored on purpose and have to travel by hand (AirDrop, USB —
never git):

1. `.env.local` — every key above, including the LinkedIn client secret.
2. `.ember-dev-db.json` — the local dev store: your profile, transcripts,
   drafts, and the LinkedIn connection. Skip it to start clean (you'll
   re-onboard and reconnect LinkedIn); copy it to carry everything over.

Then `npm install && npm run dev`. The LinkedIn redirect needs no change —
it's registered for `localhost:3003`, which is wherever the app runs.

## Posting to LinkedIn

Current posts through LinkedIn's **official Share API** — not a browser
extension driving your session. Setup is ~5 minutes, free, and self-serve:

1. Go to [developer.linkedin.com](https://developer.linkedin.com) → **Create app** (it must be associated with a LinkedIn Page — create a blank company page if you don't have one).
2. In the app's **Products** tab, request **"Sign In with LinkedIn using OpenID Connect"** and **"Share on LinkedIn"** — both approve instantly.
3. In **Auth**, add your redirect URL: `http://localhost:3000/api/linkedin/callback` (match the port you run on; add your production URL too).
4. Copy the Client ID + Secret into `.env.local` as `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`.
5. Restart, open **Queue → Connect LinkedIn**, approve. Tokens last ~60 days.

Once connected: every draft gets a **Post now** button, and planned queue
slots publish automatically when due (`/api/cron/publish`, wired to Vercel
Cron every 10 minutes in production; hit it manually in dev). Current only
ever posts drafts **you** wrote and planned — nothing autonomous.

## What's honest about it

- **Quotes are verbatim or rejected.** Every angle's supporting quote is validated as a strict substring of your transcript, server-side. A quote that doesn't match kills that angle, not the batch.
- **A story alone can never produce a post.** Pin any headline with an empty vault and Current refuses — there's a unit test for it.
- **Banned-phrase gate.** Drafts containing AI tells ("delve", "game-changer", "in today's fast-paced world") are regenerated once, then failed. Never shipped.
- **No invented numbers.** The dashboard counts angles banked, drafts written, and posts shipped — things it actually knows. No follower counts it can't see.
- **Posting is explicit.** Nothing goes to LinkedIn unless you press Post now or planned a slot yourself — and without a connection, a slot stays a reminder. The Queue page tells you which mode you're in.

## Stack

Next.js 16 · TypeScript · Supabase (Postgres + pgvector) with an in-memory dev fallback · Anthropic Claude (Sonnet 5 + Haiku 4.5) · Whisper · Hacker News (Algolia) · Vercel-ready

## Docs

- [SPEC.md](./SPEC.md) — the engineering spec: features + acceptance criteria, schema, AI pipeline, testing, deployment
