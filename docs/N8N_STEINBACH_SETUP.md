# n8n setup — Steinbach scraper

Workflow: `n8n/steinbach-scrape.workflow.json`  
Same Sheet as WK / NOS: https://docs.google.com/spreadsheets/d/1H3RDFGINQ-lBVaR_EOn1LDU4ezWf7q2bfY5XnUAFZpo/edit

## What it does

1. Fetches [steinbachedc.com/rcip/](https://steinbachedc.com/rcip/) once  
2. Parses priority NOCs from HTML (deduped mobile/desktop tabs) → upserts `priority_nocs` (`community_id=steinbach`)  
3. Finds the **Designated Employers** PDF on the same page  
4. Downloads PDF → **Extract From File** → parses employers → upserts `employers`  
5. Appends `run_log`

Local test (no n8n): ~**25 NOCs**, ~**45 employers**.

Seeds written for instant site fill (until Sheet catches up):

- `database/seeds/steinbach-priority-nocs.csv`
- `database/seeds/steinbach-employers.csv`

`npm run export:data` merges those seeds under Sheet rows (Sheet wins on `record_id`).

## Import

1. n8n → **Import from File** → `n8n/steinbach-scrape.workflow.json`  
2. Attach **Google Sheets** credential on every Sheets node  
3. Confirm **Extract PDF Text** node exists (`Extract From File` → operation PDF)  
4. **Manual Run**  
5. Confirm **Weekly Schedule** (Mon **08:00** `America/Vancouver`) → set workflow **Active**

## Schedule

| Trigger | When |
|---|---|
| Manual Run | Anytime |
| Weekly Schedule | Mondays 08:00 America/Vancouver (after WK 06:00 / NOS 07:00) |

After a successful run (or after refreshing seeds):

```bash
npm run parse:steinbach   # refresh local seed CSVs
npm run export:data && npm run deploy
```

## Expected Sheet result

| Tab | New rows (approx) |
|---|---|
| `priority_nocs` | +25 Steinbach rows |
| `employers` | +~45 Steinbach rows |
| `run_log` | 1 row, `adapter=steinbach-html-nocs+pdf-employers` |

Optional: paste/import the seed CSVs into the Sheet so n8n and export stay aligned without waiting for the first automated run.

## Rebuild after code changes

```bash
npm run build:steinbach-n8n
```

## Product reminder

Unofficial search aid — always link candidates to the official Steinbach RCIP portal.
