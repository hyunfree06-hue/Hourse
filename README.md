# Hourse

An AI-native visual workspace for independent creators. Generate inside the canvas, refine without breaking flow, and export editable visual work—without team collaboration complexity.

> Intentionally excluded: team workspaces, invites, co-editing, realtime cursors, comments/mentions, role permissions, and shared-link collaborative editing. Projects are private to their owner.

## Features

- Large canvas editing (Fabric.js)
- AI region generate / replace / use selection
- OpenAI and Black Forest Labs FLUX providers
- Autosave with optimistic locking via `updated_at`
- Google OAuth only
- Signup bonus credits (server trigger)
- Lemon Squeezy subscriptions and credit packs (USD)
- PNG / JPG / SVG export

## Stack

Next.js App Router · React · TypeScript · Tailwind CSS · Fabric.js · Supabase (`@supabase/ssr`) · Zustand · Zod · OpenAI SDK · Lemon Squeezy SDK · Sharp · Vitest · Playwright

## Local setup

```bash
cp .env.example .env.local
# fill Supabase + optional AI/billing keys
npm install
npm run dev
```

Landing, dashboard, and canvas editing work without AI/billing keys. Those features activate when keys are present.

## Environment

See `.env.example`. Never prefix server secrets with `NEXT_PUBLIC_`.

Required for core app:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_BRAND_NAME=Hourse`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional by feature:

- OpenAI / BFL keys
- Lemon Squeezy: `LEMONSQUEEZY_*` and Live Variant IDs

## Supabase

1. Create a Supabase project.
2. Copy Project URL, publishable key, and service role key.
5. Apply migrations in order on a **new** database. On an already-migrated database, only run the next unapplied files:
   - `0001_initial.sql` (once)
   - `0002_billing_currency_usd.sql`
   - `0003_rebrand_hourse.sql`
   - `0004_fix_project_persistence.sql`
6. Do **not** re-run migrations that were already applied.

## Google OAuth

1. Create a Google OAuth web client.
2. Add the Supabase callback as Authorized redirect URI.
3. Enable Google in Supabase Auth providers.
4. Set Site URL and redirect URLs for local/prod.
5. Sign-in uses `signInWithOAuth({ provider: "google" })` with no separate login form.

## AI providers

1. `OPENAI_API_KEY` (default model `gpt-image-2`)
2. `BFL_API_KEY` (default `flux-2-pro`)
3. Missing providers stay disabled in the UI; the app does not auto-switch.

## Lemon Squeezy (Live · USD)

Default is **Live** payment mode and **USD**. `LEMONSQUEEZY_TEST_MODE` is test only when set to `"true"`.

### Live product registration

#### Hourse Creator
- Product: `Hourse Creator`
- Variant: `Creator Monthly`
- Pricing model: Standard pricing
- Payment type: Subscription
- Price: `$19.00 USD`
- Billing interval: Monthly
- Free trial: None
- Setup fee: None
- Credits: 100 per successful billing period
- Env: `LEMONSQUEEZY_VARIANT_CREATOR_MONTHLY`

#### Hourse Pro
- Product: `Hourse Pro`
- Variant: `Pro Monthly`
- Pricing model: Standard pricing
- Payment type: Subscription
- Price: `$49.00 USD`
- Billing interval: Monthly
- Free trial: None
- Setup fee: None
- Credits: 300 per successful billing period
- Env: `LEMONSQUEEZY_VARIANT_PRO_MONTHLY`

#### Hourse Credit Pack
- Product: `Hourse Credit Pack`
- Variant: `50 Credits`
- Pricing model: Standard pricing
- Payment type: Single payment
- Price: `$9.99 USD`
- Billing interval: None
- Credits: 50 per successful order
- Env: `LEMONSQUEEZY_VARIANT_CREDIT_PACK`

### Setup steps

1. Activate the store and create the three products in **Live Mode · USD**.
2. Put each Live Variant ID into the matching env var.
3. Register the Live webhook URL: `{APP_URL}/api/webhooks/lemonsqueezy`
4. Set `LEMONSQUEEZY_WEBHOOK_SECRET` and keep `LEMONSQUEEZY_TEST_MODE=false`.
5. Apply `0002` then `0003` if not already applied (never re-run `0001`).
6. Confirm credits after checkout via `/billing?checkout=success`.

## Scripts

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

## License

Private — per project owner policy.
