# ember

**You already said it.**

Ember listens to your thinking — voice notes, meetings, brain-dumps — watches what the AI world is arguing about in real time, and writes the LinkedIn post where the two meet. It only writes when it catches you and the discourse overlapping, so every post is something only you could have said, published at the exact moment people are listening.

A tool that declines to post is a tool people believe: when nothing in your thinking clears the bar, ember says so, and tells you what the world is arguing about in your lane instead.

## How it works

1. **Talk.** Hit record and think out loud for two minutes (or paste a transcript).
2. **Watch it think.** Ember mines your actual claims, checks them against live AI discourse (HN, news, developer conversations), and narrates its reasoning as it goes.
3. **Get one post.** Not three variants — the post it would pick, with the reason it exists stated above it. Copy, done.

While you're away, ember keeps matching your vaulted insights against fresh discourse. Some mornings you open it and the post is already waiting: *"You said this two weeks ago — the world caught up today."*

## Docs

- [SPEC.md](./SPEC.md) — full implementation specification: features + acceptance criteria, schema, AI pipelines, testing, deployment

## Stack

Next.js 15 · TypeScript · Supabase (Postgres + pgvector) · Anthropic Claude · Whisper · Vercel
