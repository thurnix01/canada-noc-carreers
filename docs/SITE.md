# GitHub Pages site — NOC Careers

React one-pager that searches exported RCIP listings and links out to official portals.

## Local

```bash
cd "/Users/TerenceA/Documents/Graphic_Design_Job/Automation_Projects/canada-noc-carreers"
npm run export:data    # pulls from your Google Sheet → web/public/data/listings.json
npm run dev            # http://localhost:5173
```

Current export (example): **75 NOCs**, **~720 employers** across **14 RCIP communities** (BC searchable; others as directory cards until data is added).

## Sheet: activate all communities

Import `database/communities-seed-all-rcip.csv` into the Sheet **`database`** tab (or paste rows) with `active=TRUE`.  
Export also merges `data/communities.json`, so the site can show all 14 even before the Sheet is updated.

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
4. Custom domain: keep `web/public/CNAME` as `noccareers.ca` so every `gh-pages` deploy does not wipe the domain (missing CNAME → GitHub 404 on the custom URL).

### Point `noccareers.ca` at GitHub Pages

1. In the repo: **Settings → Pages → Custom domain** → enter `noccareers.ca` → Save (or rely on the committed `CNAME` after deploy).
2. At your DNS host, add:

| Type | Name / host | Value |
|---|---|---|
| **A** | `@` (apex) | `185.199.108.153` |
| **A** | `@` | `185.199.109.153` |
| **A** | `@` | `185.199.110.153` |
| **A** | `@` | `185.199.111.153` |
| **CNAME** | `www` | `thurnix01.github.io` |

3. Wait for DNS (often minutes, sometimes up to 24–48h). GitHub will show a green check when the domain resolves.
4. Then enable **Enforce HTTPS** on the Pages settings page.
5. Optional: redirect `noc.absolondesigns.ca` → `https://noccareers.ca` at your old DNS/host so bookmarks still work.

For a **user/org** root site, keep `VITE_BASE=/`.

## Refresh data after scrapers

WK + NOS n8n workflows include a **Weekly Schedule** (Mon 06:00 / 07:00 `America/Vancouver`). After they write the Sheet:

```bash
npm run export:data
npm run deploy   # from root (exports + builds + gh-pages)
```

### Job Bank counts (weekly)

Card badges like `~269 on Job Bank` are **snapshots**, not live totals. Export hits Job Bank with the same filters as the outbound link (community hub + radius), so they can differ from a Canada-wide / “various locations” search on Job Bank.

**Automated (preferred):** GitHub Action [`.github/workflows/weekly-jobbank-refresh.yml`](../.github/workflows/weekly-jobbank-refresh.yml)

- Runs every **Monday 14:00 UTC** (~07:00 Vancouver in winter)
- Also **Actions → Weekly Job Bank refresh → Run workflow** for an on-demand refresh
- Re-exports `listings.json` (incl. Job Bank hit counts), commits it, then deploys Pages

**Manual:**

```bash
npm run export:data    # full Job Bank verify (slow)
npm run deploy:pages   # build + gh-pages only (no second scrape)
```

Fast local sheet/UI work without re-hitting Job Bank:

```bash
npm run export:data:fast   # SKIP_JOBBANK=1 — keeps prior counts
npm run dev
```

Or add an n8n step later that writes `listings.json` into the repo.

## Microsoft Clarity

Before public launch, uncomment the Clarity snippet in `web/index.html` and replace `YOUR_CLARITY_ID`. See `docs/TRACKING_CLARITY.md`.

Outbound links already include UTMs:
`utm_source=rcip-aggregator&utm_medium=referral&utm_campaign=bc-pilot`
