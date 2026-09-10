# n8n setup — Thunder Bay scraper

Workflow: `n8n/thunder-bay-scrape.workflow.json`  
Sheet: https://docs.google.com/spreadsheets/d/1H3RDFGINQ-lBVaR_EOn1LDU4ezWf7q2bfY5XnUAFZpo/edit

## What it does

1. Fetches [Thunder Bay RCIP page](https://gotothunderbay.ca/rural-community-immigration-pilot-rcip/)  
2. Parses ~25 priority NOCs from HTML  
3. Finds the latest **Designated Employer** PDF (e.g. `As-of-August-13-2026.pdf`)  
4. Downloads PDF → **Extract From File** → parses employers (~480–500)  
5. Upserts Sheet tabs + `run_log`

Local test: ~**25 NOCs**, ~**485 employers**.

Note: the PDF marks some employers in red as “not hiring”; text extraction cannot see colour, so recruiting status stays `unknown` with a source note.

## Import

1. Import `n8n/thunder-bay-scrape.workflow.json`  
2. Attach Google Sheets credentials  
3. Confirm **Extract PDF Text**  
4. Manual Run  
5. Weekly Schedule Mon **11:00** `America/Vancouver` → Active  

```bash
npm run parse:thunder-bay
npm run export:data && npm run deploy
```

## Rebuild

```bash
npm run build:thunder-bay-n8n
```
