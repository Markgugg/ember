# Deploying Current to Vercel

Fifteen minutes, three accounts (Vercel, Supabase, your existing LinkedIn app),
zero code changes. Every visitor to the deployed site gets their own private
workspace automatically — an identity cookie scopes all data per browser, so
reviewers can each onboard, draft, and connect their own LinkedIn without
seeing each other's work.

## 1 · Supabase (the production database)

The local dev store is a JSON file — serverless functions can't keep one, so
production needs Postgres.

1. [supabase.com](https://supabase.com) → **New project** (free tier is fine).
2. Open the project's **SQL Editor** → paste the whole of
   [`supabase/all-migrations.sql`](./supabase/all-migrations.sql) → **Run**.
   That's the entire schema, pgvector included.
3. From **Project Settings → API**, copy three values:
   - Project URL
   - `anon` public key
   - `service_role` key (keep this one secret)

## 2 · Vercel

Either import in the browser — [vercel.com/new](https://vercel.com/new) →
pick the `ember` GitHub repo → framework auto-detects as Next.js — or from
this folder:

```bash
npx vercel login
npx vercel --prod
```

Set these environment variables (Project → Settings → Environment Variables):

| Variable | Value | Why |
|---|---|---|
| `ANTHROPIC_API_KEY` | your key | all the writing — without it the site runs in heuristic fixture mode |
| `OPENAI_API_KEY` | your key | real embeddings + Whisper for the mic |
| `NEXT_PUBLIC_SUPABASE_URL` | from step 1 | the database |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from step 1 | the database |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 1 | server-side data access |
| `LINKEDIN_CLIENT_ID` | same as local | posting |
| `LINKEDIN_CLIENT_SECRET` | same as local | posting |
| `CRON_SECRET` | any random string | locks `/api/cron/publish` to Vercel Cron |

Deliberately **absent**:

- `LINKEDIN_REDIRECT_URI` — do NOT copy the localhost value from your
  `.env.local`. Unset, the app derives the callback from the request origin,
  which is exactly right on Vercel.
- `EMBER_DEV_SCHEDULER` — that's the localhost stand-in for Vercel Cron.
  `vercel.json` already schedules the real thing every 10 minutes.

## 3 · LinkedIn app

[developer.linkedin.com](https://developer.linkedin.com) → your app → **Auth**
→ add the production callback to Authorized redirect URLs:

```
https://<your-project>.vercel.app/api/linkedin/callback
```

Keep the localhost one too — local dev still uses it.

## 4 · Prove it works

- Open the URL in a private window → onboarding → **Continue as a guest** →
  name → home loads with a live news feed.
- Paste a transcript → composer mines angles → draft appears.
- Second private window → onboards separately (per-browser workspaces).
- Connect LinkedIn from the avatar menu → post a draft → it's live.
- `/api/dev/*` routes return 404 (production kills the debug surface).

## Costs

Vercel Hobby + Supabase Free cover a demo comfortably. The only metered spend
is the Anthropic/OpenAI keys; a full compose run costs a few cents.
