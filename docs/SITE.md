# GitHub Pages site — NOC Careers

React one-pager that searches exported RCIP listings and links out to official portals.

## Local

```bash
cd "/Users/TerenceA/Documents/Graphic_Design_Job/Automation_Projects/canada-noc-carreers"
npm run export:data    # pulls from your Google Sheet → web/public/data/listings.json
npm run dev            # http://localhost:5173
```

Current export (example): **75 NOCs**, **~720 employers** across the 3 BC pilot communities.

## Deploy to GitHub Pages

1. Create a GitHub repo (e.g. `canada-noc-careers`) and push this project.  
2. For a **project** site (`https://USER.github.io/REPO/`):

```bash
cd web
VITE_BASE=/REPO_NAME/ npm run build
# or from root after setting the name:
# VITE_BASE=/canada-noc-careers/ npm run build --prefix web
npx gh-pages -d dist
```

3. In GitHub → Settings → Pages → source **gh-pages** branch.

For a **user/org** root site, keep `VITE_BASE=/`.

## Refresh data after scrapers

WK + NOS n8n workflows include a **Weekly Schedule** (Mon 06:00 / 07:00 `America/Vancouver`). After they write the Sheet:

```bash
npm run export:data
npm run deploy   # from root (exports + builds + gh-pages)
```

Or add an n8n step later that writes `listings.json` into the repo.

## Microsoft Clarity

Before public launch, uncomment the Clarity snippet in `web/index.html` and replace `YOUR_CLARITY_ID`. See `docs/TRACKING_CLARITY.md`.

Outbound links already include UTMs:
`utm_source=rcip-aggregator&utm_medium=referral&utm_campaign=bc-pilot`
