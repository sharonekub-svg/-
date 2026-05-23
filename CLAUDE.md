# Instructions for Claude

This repo currently uses the static Hapogea preview in `hapogea-preview/index.html`.

Do not replace it with a React/Vite bundle, do not create `hapogea-preview/assets/*.js`,
and do not change `hapogea-preview/index.html` into a shell that loads `/assets/...`.
That replacement broke the intended site.

Important files:

- `api/winner-feed.js` - live Winner data, odds model, basketball/football feed.
- `hapogea-preview/index.html` - the actual preview UI. Edit this file directly.
- `vercel.json` - deploys `hapogea-preview` as the output directory and rewrites `/api/*`.

Current product requirements:

- Basketball must include all leagues available in Winner, not only NBA.
- For basketball, use `המנצח/ת` when available.
- If `המנצח/ת` is not available, use full-game handicap markets such as
  `הימור יתרון - כולל הארכות אם יהיו`.
- Odds must be real Winner pre-match odds.
- Show clearly what was picked with a visible `הימרנו` section.
- Show odds under each team. For handicap, show the line too, for example `+6.5 1.70`.
- If the pick is draw, write `תיקו` clearly in the center between the two teams.
- Make `תפס`, `נפל`, and `ממתין` status badges large and obvious.

Workflow:

```bash
git fetch origin
git checkout codex/winner-live-details
git pull --rebase origin codex/winner-live-details
```

Before pushing:

```bash
node --check api/winner-feed.js
node -e "const fs=require('fs'); const s=fs.readFileSync('hapogea-preview/index.html','utf8'); const js=s.match(/<script>([\\s\\S]*)<\\/script>/)?.[1]; if (js) new Function(js); console.log('preview js ok')"
git status -sb
```

Push only after rebasing. Never force-push unless the human explicitly asks.
