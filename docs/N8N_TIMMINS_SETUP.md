# n8n setup — Timmins scraper

Workflow: `n8n/timmins-scrape.workflow.json`  
Same Sheet: https://docs.google.com/spreadsheets/d/1H3RDFGINQ-lBVaR_EOn1LDU4ezWf7q2bfY5XnUAFZpo/edit

## What it does

1. Fetches [timminsedc.com/immigration/](https://timminsedc.com/immigration/) once  
2. Parses **RCIP** (+ FCIP-only) priority NOCs from Elementor tabs → upserts `priority_nocs` (`community_id=timmins`)  
3. Finds the **Designated Employer List** PDF  
4. Downloads PDF → **Extract From File** → parses employers (sector + pilot RCIP/FCIP) → upserts `employers`  
5. Appends `run_log`

Local test: ~**30 NOCs**, ~**137 employers**.

Seeds: `database/seeds/timmins-*.csv` (merged on `npm run export:data`).

## Import

1. n8n → **Import from File** → `n8n/timmins-scrape.workflow.json`  
2. Attach **Google Sheets** credentials  
3. Confirm **Extract PDF Text** node  
4. **Manual Run**  
5. **Weekly Schedule** Mon **09:00** `America/Vancouver` → **Active**

## After a run

```bash
npm run parse:timmins   # optional seed refresh
npm run export:data && npm run deploy
```

## Rebuild after code changes

```bash
npm run build:timmins-n8n
```
