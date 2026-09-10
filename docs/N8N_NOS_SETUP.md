# n8n setup — North Okanagan–Shuswap scraper

Workflow: `n8n/north-okanagan-shuswap-scrape.workflow.json`  
Same Sheet as West Kootenay: https://docs.google.com/spreadsheets/d/1H3RDFGINQ-lBVaR_EOn1LDU4ezWf7q2bfY5XnUAFZpo/edit

## What it does

1. Fetches priority NOCs from HTML → upserts into `priority_nocs` (`community_id=north-okanagan-shuswap`)  
2. Finds the latest **Designated Employers List** PDF on the Resources page (filename may be singular or plural, e.g. `…Designated-Employers-List-Aug-31-2026.pdf`)  
3. Downloads PDF → **Extract From File** → parses employers → upserts into `employers`  
4. Appends `run_log`

Local test (no n8n): ~**25 NOCs**, ~**454 employers**.

## Import

1. n8n → **Import from File** → `n8n/north-okanagan-shuswap-scrape.workflow.json`  
2. Attach **Google Sheets** credential on every Sheets node  
3. Confirm **Extract PDF Text** node exists (`Extract From File` → operation PDF)  
4. **Manual Run**  
5. Confirm **Weekly Schedule** (Mon **07:00** `America/Vancouver`) → set workflow **Active**

## Schedule

| Trigger | When |
|---|---|
| Manual Run | Anytime |
| Weekly Schedule | Mondays 07:00 America/Vancouver (after WK at 06:00) |

After a successful run:

```bash
npm run export:data && npm run deploy
```

## Expected Sheet result

| Tab | New rows (approx) |
|---|---|
| `priority_nocs` | +25 NOS rows (WK rows stay) |
| `employers` | +~450 NOS rows (WK rows stay) |
| `run_log` | 1 row, `adapter=nos-html-nocs+pdf-employers` |

## If Fetch Resources HTML says “access has been limited”

**Cause:** an earlier workflow version ran that HTTP request once per Sheet row (~266 times) and tripped the site firewall (Wordfence-style block).

**Fix:** re-import the updated `n8n/north-okanagan-shuswap-scrape.workflow.json` (includes **Collapse After Employer Read** so the fetch runs **once**).

Then:

1. Wait 10–15 minutes (or until the site loads in your browser again)  
2. Delete the old broken NOS workflow (or deactivate it)  
3. Import the new file as a **new** workflow  
4. Re-attach Google Sheets credentials  
5. Manual Run once  

Confirm **Fetch Resources HTML** URL is exactly:

`https://rcipnorthokanaganshuswap.com/resources-and-policies/`

## If Extract From File fails

Some n8n installs hide/rename that node. Alternatives:

1. In the failed node, search for **Extract From File** / **PDF** and re-add it  
2. Or run locally and we can add a CSV import path later:

```bash
cd "/Users/TerenceA/Documents/Graphic_Design_Job/Automation_Projects/canada-noc-carreers"
npm run parse:nos
```

## Rebuild after code changes

```bash
npm run build:nos-n8n
```

## Product reminder

NOS (and most RCIP sites) warn: **do not solicit designated employers** unless a job is publicly posted. The aggregator should keep that warning in the UI.
