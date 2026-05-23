# Instructions for Claude

This repository has one website only: Hapogea, the Winner odds site.

Do not create or restore any old mobile app, backend app, Next.js app, Vite app, or duplicate website. Do not create a second output folder.

Use these files:

- `hapogea-preview/index.html` - the website UI. Edit this file directly.
- `api/winner-feed.js` - live Winner data, odds model, basketball/football feed.
- `api/winner-snapshot.json` - fallback snapshot.
- `scripts/refresh-winner-snapshot.js` - refreshes the snapshot.
- `vercel.json` - deploys `hapogea-preview` and rewrites `/api/*`.

Vercel project:

- Existing project name: `hit`
- Production alias used by Codex: `https://hit-alpha.vercel.app`
- Canonical GitHub repo: `https://github.com/sharonekub-svg/hapogea`
- Do not create a new Vercel project.
- Do not deploy a separate preview-only app as the source of truth.

Important workflow:

```bash
git fetch origin
git checkout codex/winner-live-details
git pull --rebase origin codex/winner-live-details
```

Before pushing:

```bash
node --check api/winner-feed.js
npm run check
git status -sb
```

Current product requirements:

- Basketball includes all Winner basketball leagues, not only NBA.
- Use real Winner pre-match odds only.
- Show exactly what was picked in the `הימרנו` section.
- Show odds under each team; for handicap, include the line.
- If the pick is draw, show `תיקו` clearly in the center.
- Closed results show `נסגר`; settled tracked picks show `נתפס` or `לא נתפס`.
- Public cards should stay compact and should not show the score meter.
