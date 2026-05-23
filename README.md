# Hapogea Winner Site

This repository contains one website only: the Hapogea/Winner odds site.

The live Vercel project is `hit`. The intended production URL is:

- https://hit-alpha.vercel.app

Do not add a second app, mobile app, backend app, Vite shell, or Next.js app here. The UI is the static file in `hapogea-preview/index.html`, and the data API lives in `api/`.

## Project Structure

- `hapogea-preview/index.html` - the actual website UI.
- `api/winner-feed.js` - Winner feed, scoring model, football/basketball logic, and API response.
- `api/winner-snapshot.json` - fallback snapshot used when the live Winner API is blocked.
- `api/fetch-product-page.js` - generic product-page fetch helper.
- `scripts/refresh-winner-snapshot.js` - refreshes `api/winner-snapshot.json`.
- `vercel.json` - deploys `hapogea-preview` and rewrites `/api/*`.

## Vercel

The repo should be linked to the existing Vercel project named `hit`.

Build settings are intentionally static:

- Build command: `echo Static Hapogea demo ready`
- Output directory: `hapogea-preview`
- Framework: `Other` / `null`

The site does not need legacy app environment variables. If future env vars are needed, add them deliberately for this project only.

## Development

Validate before pushing:

```bash
node --check api/winner-feed.js
npm run check
```

Refresh the fallback Winner snapshot:

```bash
node scripts/refresh-winner-snapshot.js
```

Deploy:

```bash
npx vercel --prod --yes
```
