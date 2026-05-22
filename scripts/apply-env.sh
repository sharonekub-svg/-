#!/usr/bin/env bash
# Pushes all env vars to a Vercel project + Supabase + writes local .env files.
# Run from your machine (not from the Claude Code sandbox).
#
# Usage:
#   1. cp .env.deploy.example .env.deploy
#   2. Fill in real values in .env.deploy
#   3. bash scripts/apply-env.sh
#
# Requires: bash, curl, jq

set -euo pipefail

DEPLOY_ENV="${1:-.env.deploy}"

if [[ ! -f "$DEPLOY_ENV" ]]; then
  echo "Missing $DEPLOY_ENV — copy from .env.deploy.example and fill in values."
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$DEPLOY_ENV"; set +a

require() {
  local v="$1"
  if [[ -z "${!v:-}" ]]; then
    echo "✗ Missing $v in $DEPLOY_ENV"; exit 1
  fi
}

require VERCEL_TOKEN
require VERCEL_PROJECT_ID
require VERCEL_ORG_ID

API="https://api.vercel.com"
H_AUTH="Authorization: Bearer $VERCEL_TOKEN"

# All EXPO_PUBLIC_* go to Vercel (production + preview + development).
PUBLIC_KEYS=(
  EXPO_PUBLIC_SUPABASE_URL
  EXPO_PUBLIC_SUPABASE_ANON_KEY
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
  EXPO_PUBLIC_STRIPE_MERCHANT_ID
  EXPO_PUBLIC_SENTRY_DSN
  EXPO_PUBLIC_POSTHOG_KEY
  EXPO_PUBLIC_POSTHOG_HOST
  EXPO_PUBLIC_APP_SCHEME
  EXPO_PUBLIC_UNIVERSAL_LINK_HOST
)

push_var() {
  local key="$1"
  local val="${!key:-}"
  if [[ -z "$val" ]]; then
    echo "  - $key (skipped, empty)"
    return
  fi
  # Delete existing key (idempotent), then create.
  curl -s -X DELETE -H "$H_AUTH" \
    "$API/v9/projects/$VERCEL_PROJECT_ID/env/$key?teamId=$VERCEL_ORG_ID" >/dev/null || true
  local body
  body=$(jq -n --arg k "$key" --arg v "$val" \
    '{key:$k, value:$v, type:"encrypted", target:["production","preview","development"]}')
  local resp
  resp=$(curl -s -X POST -H "$H_AUTH" -H "Content-Type: application/json" \
    -d "$body" "$API/v10/projects/$VERCEL_PROJECT_ID/env?teamId=$VERCEL_ORG_ID")
  if echo "$resp" | jq -e '.error' >/dev/null 2>&1; then
    echo "  ✗ $key: $(echo "$resp" | jq -r '.error.message')"
  else
    echo "  ✓ $key"
  fi
}

echo "→ Pushing env vars to Vercel project $VERCEL_PROJECT_ID"
for k in "${PUBLIC_KEYS[@]}"; do push_var "$k"; done

# Trigger a fresh deploy so the new env vars take effect.
echo
echo "→ Triggering a redeploy"
LATEST=$(curl -s -H "$H_AUTH" \
  "$API/v6/deployments?projectId=$VERCEL_PROJECT_ID&teamId=$VERCEL_ORG_ID&limit=1" \
  | jq -r '.deployments[0].uid // empty')
if [[ -n "$LATEST" ]]; then
  curl -s -X POST -H "$H_AUTH" \
    "$API/v13/deployments?teamId=$VERCEL_ORG_ID&forceNew=1" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"shakana1\",\"deploymentId\":\"$LATEST\",\"target\":\"production\"}" \
    | jq -r '.url // .error.message // .'
else
  echo "  (no prior deploy found — push a commit to trigger one)"
fi

# Write supabase/.env.local for edge-function dev.
if [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  mkdir -p supabase
  cat > supabase/.env.local <<EOF
SUPABASE_URL=${EXPO_PUBLIC_SUPABASE_URL:-}
SUPABASE_ANON_KEY=${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET:-}
STRIPE_CONNECT_ACCOUNT_ID=${STRIPE_CONNECT_ACCOUNT_ID:-}
STRIPE_PUBLISHABLE_KEY=${EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY:-}
EOF
  echo
  echo "→ Wrote supabase/.env.local (gitignored)"
fi

echo
echo "Done. Visit https://shakana1.vercel.app once the redeploy finishes."
