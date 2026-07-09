# ember

**You already said it.**

Ember listens to your thinking — voice notes, meetings, brain-dumps — watches what the AI world is arguing about in real time, and writes the LinkedIn post where the two meet. It only writes when it catches you and the discourse overlapping, so every post is something only you could have said, published at the exact moment people are listening.

A tool that declines to post is a tool people believe: when nothing in your thinking clears the bar, ember says so, and tells you what the world is arguing about in your lane instead.

## How it works

1. **Talk.** Hit record and think out loud for two minutes (or paste a transcript).
2. **Watch it think.** Ember mines your actual claims, checks them against live AI discourse (HN, news, developer conversations), and narrates its reasoning as it goes.
3. **Get one post.** Not three variants — the post it would pick, with the reason it exists stated above it. Copy, done.

While you're away, ember keeps matching your vaulted insights against fresh discourse. Some mornings you open it and the post is already waiting: *"You said this two weeks ago — the world caught up today."*

## Run it

```bash
npm install
npm run dev        # → http://localhost:3000
```

**Zero keys required.** With no `.env.local`, ember runs in fixture mode: deterministic heuristic AI (real sentence-level insight mining, real embedding-based matching) and an in-memory store — the full product loop works, including the refusal. Use the "Try it with a sample transcript" chip.

To go live, copy `.env.example` → `.env.local` and fill in:

| Key | Unlocks |
|---|---|
| `ANTHROPIC_API_KEY` + `OPENAI_API_KEY` | real insight mining, intersection judging, draft writing, voice rewrite |
| `OPENAI_API_KEY` alone | Whisper transcription for the record button |
| `NEXT_PUBLIC_SUPABASE_URL` + keys | persistent Postgres storage (run `supabase/migrations/0001_init.sql`) |

```bash
npm test           # unit tests: provenance gate, scoring, banned phrases
npm run build      # production build
```

## What's honest about it

- **Quotes are verbatim or rejected** — every insight's supporting quote is validated as a strict substring of your transcript, server-side.
- **A trend with no matching insight can never produce a post** — if nothing you said meets what the world is arguing about, ember refuses and tells you what it almost picked and why it didn't.
- **Banned-phrase gate** — drafts containing AI-tell phrases ("delve", "game-changer", …) are regenerated or failed, never shipped.

## Docs

- [SPEC.md](./SPEC.md) — full implementation specification: features + acceptance criteria, schema, AI pipelines, testing, deployment

## Stack

Next.js 16 · TypeScript · Supabase (Postgres + pgvector) with in-memory dev fallback · Anthropic Claude (Sonnet 5 + Haiku 4.5) · Whisper · Vercel-ready
