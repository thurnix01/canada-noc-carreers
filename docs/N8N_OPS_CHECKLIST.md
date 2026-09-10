# n8n ops checklist — weekly scrapers

Confirm in n8n that each workflow is **Active** and timezone is **America/Vancouver**.

| Workflow | File | Schedule |
|---|---|---|
| West Kootenay | `n8n/west-kootenay-scrape.workflow.json` | Mon **06:00** |
| North Okanagan–Shuswap | `n8n/north-okanagan-shuswap-scrape.workflow.json` | Mon **07:00** |
| Steinbach | `n8n/steinbach-scrape.workflow.json` | Mon **08:00** |
| Timmins | `n8n/timmins-scrape.workflow.json` | Mon **09:00** |
| North Bay | `n8n/north-bay-scrape.workflow.json` | Mon **10:00** |

After Monday runs (or any Manual Run):

```bash
npm run export:data && npm run deploy
```

Check `run_log` in the Sheet: `ok=TRUE`, non-zero `rows_upserted`, empty `errors`.
