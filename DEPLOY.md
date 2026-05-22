# Deploy walkthrough

Run these once on **your local machine** (not in a Claude Code on Web sandbox — those don't have outbound network to Vercel/Supabase). Total time: ~10 minutes.

## 0. Prereqs

```bash
git clone https://github.com/sharonekub-svg/shakana1.git
cd shakana1
# Tools you'll need locally:
which curl jq pnpm   # install via brew / apt if missing
```

## 1. Apply the database schema

Open the Supabase SQL Editor:
https://supabase.com/dashboard/project/<your-ref>/sql/new

Paste the entire contents of [`supabase/scripts/all-migrations.sql`](supabase/scripts/all-migrations.sql) → **Run**. Schema, RLS, triggers, and the `claim_invite` RPC are now live.

Then in **Authentication → Providers**:
- Enable **Phone (SMS)**, hook up your Twilio / MessageBird credentials, and set template:
  `הקוד שלך ל-שכנה הוא: {{ .Code }}`
- Enable **Google** with your OAuth client.

## 2. Configure environment

```bash
cp .env.deploy.example .env.deploy
# Open .env.deploy in your editor and paste in:
#   - Supabase URL + anon key + service-role key (Project Settings → API)
#   - Stripe publishable + secret + webhook signing secret + Connect acct id
#   - Sentry DSN (sentry.io → project → Client Keys)
#   - PostHog Project API key + host
#   - Vercel token (vercel.com/account/tokens) + project + team IDs
```

## 3. Push env vars to Vercel + redeploy

```bash
bash scripts/apply-env.sh
```

This:
- Deletes old env vars and rewrites every `EXPO_PUBLIC_*` key in Vercel
- Triggers a fresh production redeploy
- Writes `supabase/.env.local` for local edge-function dev

The site will be live at **https://shakana1.vercel.app** within ~2 minutes.

## 4. Deploy Supabase edge functions

```bash
supabase login                                  # one-time
supabase link --project-ref <your-ref>          # one-time
supabase secrets set --env-file supabase/.env.local
for fn in create-order generate-invite claim-invite create-payment-intent confirm-delivery refund-escrow delete-account; do
  supabase functions deploy "$fn"
done
supabase functions deploy stripe-webhook --no-verify-jwt
```

## 5. Point Stripe at the webhook

In the Stripe Dashboard → Developers → Webhooks → **Add endpoint**:

```
URL: https://<your-supabase-ref>.functions.supabase.co/stripe-webhook
Events:
  - payment_intent.amount_capturable_updated
  - payment_intent.succeeded
  - payment_intent.canceled
  - payment_intent.payment_failed
```

Copy the new signing secret (`whsec_...`) into `.env.deploy` as `STRIPE_WEBHOOK_SECRET`, then run `supabase secrets set --env-file supabase/.env.local` again.

## 6. Verify

```bash
curl -i https://shakana1.vercel.app                    # should 200 with the Shakana SPA
supabase functions invoke create-order --no-verify-jwt # auth-required, expect 401: confirms function is up
```

## 7. (Optional) Mobile build

```bash
cd apps/mobile
pnpm install
eas init                  # one-time
eas build --platform ios  # or android
```
