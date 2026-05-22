# Shakana (שכנה)

Group ordering, split payment, and invite-based escrow for neighbors — a production mobile app in RTL Hebrew.

## Stack

- **Mobile**: Expo (React Native) + TypeScript + NativeWind + React Query + Zustand
- **Backend**: Supabase (Postgres + Auth + Realtime + RLS) + Edge Functions (Deno)
- **Payments**: Stripe Connect (manual-capture escrow)
- **Observability**: Sentry + PostHog
- **Deploy**: EAS Build (mobile), Supabase CLI (db + functions), Vercel (web export)

## Layout

```
apps/mobile/              Expo app (Expo Router)
supabase/
  migrations/             Schema + RLS + triggers (versioned SQL)
  functions/              Deno Edge Functions (Stripe, escrow, invites)
.github/workflows/        CI: typecheck/lint on mobile, deploy on supabase
vercel.json               Vercel web-export config (root)
```

## Setup

### 1. Prereqs

- Node 20+, pnpm 9, Supabase CLI, Stripe CLI
- iOS simulator (Xcode) and/or Android SDK
- A Supabase project, a Stripe Connect platform account, a Sentry project, a PostHog project

### 2. Install

```bash
pnpm install
cp .env.example .env
# fill in real values (do not commit)
```

### 3. Supabase (local)

```bash
supabase start
supabase db reset
pnpm supabase:gen:types
pnpm supabase:functions:serve
```

### 4. Stripe webhooks (local)

```bash
stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook
# copy whsec_... into supabase/.env.local as STRIPE_WEBHOOK_SECRET
```

### 5. Mobile

```bash
pnpm mobile:start               # Metro bundler
pnpm mobile:ios                 # iOS simulator
pnpm mobile:android             # Android emulator
```

### 6. Deep links (dev)

```bash
# iOS simulator
xcrun simctl openurl booted "shakana://join/TEST_TOKEN"
# Android emulator
adb shell am start -a android.intent.action.VIEW -d "shakana://join/TEST_TOKEN"
```

## Web hosting (Vercel)

The Expo app exports as a static web build via `react-native-web`:

```bash
pnpm --filter @shakana/mobile build:web   # output: apps/mobile/dist
```

Vercel deploy:

1. Vercel → **New Project** → import `sharonekub-svg/shakana1`.
2. Vercel auto-detects `vercel.json`. Leave framework as **Other**.
3. **Environment Variables** — add the `EXPO_PUBLIC_*` keys from `.env.example` (Supabase URL, anon key, Stripe publishable key, PostHog, Sentry DSN, deep-link host).
4. Deploy.

Native-only features (Stripe PaymentSheet, expo-secure-store, native deep linking) gracefully no-op or fall back to web equivalents (localStorage for sessions, browser tab navigation for links).

## Architecture

- **Single source of truth**: Supabase DB. Clients never trust local state — every cold start re-reads from the DB.
- **RLS on every table.** Zero anonymous access to orders, participants, invites, payments, or webhook events.
- **Stripe = payment authority.** All payment state transitions happen in `stripe-webhook`. Clients never self-confirm payment status.
- **Idempotency everywhere.** `Idempotency-Key` on every Stripe mutation; `webhook_events.stripe_event_id` UNIQUE for webhook dedupe.
- **Escrow by default.** `PaymentIntent.capture_method = manual` → funds authorized but held until the order creator confirms delivery.

## PostHog events

| Event | Emitted when |
| ----- | ------------ |
| `start_order_clicked` | User taps "צור הזמנה חדשה" on Orders tab |
| `invite_sent` | User taps Share on the invite sheet |
| `join_success` | `claim-invite` returns 200 |
| `payment_completed` | `stripe-webhook` processes `payment_intent.amount_capturable_updated` |
| `order_completed` | Order transitions to `completed` after escrow release |

## Compliance

- App Tracking Transparency (ATT) prompt before PostHog identify
- Account deletion in Profile → `delete-account` edge function
- Terms of Service + Privacy Policy linked on Welcome + Address
- 44pt+ touch targets, VoiceOver labels
- Secure session storage via `expo-secure-store`

## License

Proprietary.

