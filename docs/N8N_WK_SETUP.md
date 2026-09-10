# n8n setup — West Kootenay scraper

Workflow file: `n8n/west-kootenay-scrape.workflow.json`  
Sheet: https://docs.google.com/spreadsheets/d/1H3RDFGINQ-lBVaR_EOn1LDU4ezWf7q2bfY5XnUAFZpo/edit

## What it does

1. Reads existing `priority_nocs`  
2. Fetches https://westkootenayimmigration.ca/priorities/  
3. Upserts ~25 priority NOCs (match on `record_id`)  
4. Waits 3 seconds (robots crawl-delay)  
5. Reads existing `employers`  
6. Fetches https://westkootenayimmigration.ca/designated-employers/  
7. Upserts ~260 designated employers  
8. Appends a row to `run_log`

Missing rows on a later run (that are not `manual_override=TRUE`) get `status=stale`.

## Import (n8n.cbhrcom.com)

1. **Workflows → Import from File** → pick `n8n/west-kootenay-scrape.workflow.json`  
2. Open every **Google Sheets** node → select your existing **Google Sheets** OAuth credential (same as Lead Desk / outreach)  
3. Confirm document ID is `1H3RDFGINQ-lBVaR_EOn1LDU4ezWf7q2bfY5XnUAFZpo`  
4. Confirm sheet names: `priority_nocs`, `employers`, `run_log`  
5. **Save** → **Manual Run** once  
6. Confirm a **Weekly Schedule** node exists (Mon **06:00** `America/Vancouver`) → toggle the workflow **Active** so it runs automatically  

## Schedule

| Trigger | When |
|---|---|
| Manual Run | Anytime |
| Weekly Schedule | Mondays 06:00 America/Vancouver |

After a successful scheduled run, refresh the site data from your machine:

```bash
npm run export:data && npm run deploy
```

(Or add a later n8n step that writes `listings.json` into the repo.)

## Expected result

| Tab | Approx rows after first run |
|---|---|
| `priority_nocs` | 25 (`community_id=west-kootenay`) |
| `employers` | ~260 |
| `run_log` | 1 new row, `ok=TRUE` |

## Local parser test (no n8n)

```bash
cd "/Users/TerenceA/Documents/Graphic_Design_Job/Automation_Projects/canada-noc-carreers"
node scripts/parse-west-kootenay.mjs
```

Rebuild workflow JSON after parser changes:

```bash
node scripts/build-wk-n8n-workflow.mjs
```

## If HTTP node returns empty HTML

In **Fetch Priorities HTML** / **Fetch Employers HTML**:

- Response format = **Text**  
- User-Agent header already set to `RCIPAggregatorBot/0.1 (+mailto:absolondesigns@gmail.com)`

## Next after this works

1. Keep Weekly Schedule active (already in the workflow JSON)  
2. Peace Liard employers PDF adapter (optional)  
3. Automate `export:data` → GitHub Pages after Sheet updates  
