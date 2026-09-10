# n8n setup — North Bay scraper

Workflow: `n8n/north-bay-scrape.workflow.json`  
Sheet: https://docs.google.com/spreadsheets/d/1H3RDFGINQ-lBVaR_EOn1LDU4ezWf7q2bfY5XnUAFZpo/edit

## What it does

1. Fetches [nbrcip.ca/employers/](https://nbrcip.ca/employers/) → parses the priority NOC HTML table (~25)  
2. Fetches employer JSON from `admin-ajax.php?action=load_monday_data` (~238)  
3. Upserts `priority_nocs` + `employers` (`community_id=north-bay`)  
4. Appends `run_log`

No PDF / Extract From File node required.

## Import

1. Import `n8n/north-bay-scrape.workflow.json`  
2. Attach Google Sheets credentials  
3. Manual Run  
4. Weekly Schedule Mon **10:00** `America/Vancouver` → Active  

```bash
npm run parse:north-bay
npm run export:data && npm run deploy
```

## Rebuild

```bash
npm run build:north-bay-n8n
```
