# n8n ops checklist — weekly scrapers

Confirm in n8n that each workflow is **Active** and timezone is **America/Vancouver**.

| Workflow | File | Schedule |
|---|---|---|
| West Kootenay | `n8n/west-kootenay-scrape.workflow.json` | Mon **06:00** |
| North Okanagan–Shuswap | `n8n/north-okanagan-shuswap-scrape.workflow.json` | Mon **07:00** |
| Steinbach | `n8n/steinbach-scrape.workflow.json` | Mon **08:00** |
| Timmins | `n8n/timmins-scrape.workflow.json` | Mon **09:00** |
| North Bay | `n8n/north-bay-scrape.workflow.json` | Mon **10:00** |
| Thunder Bay | `n8n/thunder-bay-scrape.workflow.json` | Mon **11:00** |
| Pictou County | `n8n/pictou-county-scrape.workflow.json` | Mon **12:00** |
| Sudbury | `n8n/sudbury-scrape.workflow.json` | Mon **13:00** |
| Sault Ste. Marie | `n8n/sault-ste-marie-scrape.workflow.json` | Mon **14:00** |
| Altona/Rhineland | `n8n/altona-rhineland-scrape.workflow.json` | Mon **15:00** |
| Brandon | `n8n/brandon-scrape.workflow.json` | Mon **16:00** |
| Moose Jaw | `n8n/moose-jaw-scrape.workflow.json` | Mon **17:00** |
| Claresholm | `n8n/claresholm-scrape.workflow.json` | Mon **18:00** |

**Peace Liard** stays manual (NOCs in Sheet/seeds; no scrapable employer list on the Wix site).

PDF workflows (Pictou, Moose Jaw, Thunder Bay, Steinbach, Timmins, NOS): enable **Extract From File** / PDF text node after import.

After Monday runs (or any Manual Run):

```bash
npm run export:data && npm run deploy
```

Check `run_log` in the Sheet: `ok=TRUE`, non-zero `rows_upserted`, empty `errors`.
