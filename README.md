# NOC Careers — Canada RCIP curated aggregator

Unofficial search site for Rural Community Immigration Pilot **priority NOCs** and **designated employers**. Drives traffic to official community portals.

**Stack:** n8n → Google Sheets → `listings.json` → React (Vite) on GitHub Pages

## Live data (your Sheet)

https://docs.google.com/spreadsheets/d/1H3RDFGINQ-lBVaR_EOn1LDU4ezWf7q2bfY5XnUAFZpo/edit

## Status

| Phase | Status |
|---|---|
| Discovery + schema | Done |
| West Kootenay n8n | Done |
| North Okanagan–Shuswap n8n | Done |
| Peace Liard NOCs (manual) | Done |
| React search site | **Ready locally** — `web/` (`docs/SITE.md`) |
| Clarity | TODO — uncomment ID in `web/index.html` |
| Partner pitch | Optional — `docs/PARTNER_PITCH.md` |

## Quick start (site)

```bash
cd "/Users/TerenceA/Documents/Graphic_Design_Job/Automation_Projects/canada-noc-carreers"
npm run export:data
npm run dev
```

Deploy: see `docs/SITE.md`.

## n8n scrapers

- `n8n/west-kootenay-scrape.workflow.json` — `docs/N8N_WK_SETUP.md`
- `n8n/north-okanagan-shuswap-scrape.workflow.json` — `docs/N8N_NOS_SETUP.md`
