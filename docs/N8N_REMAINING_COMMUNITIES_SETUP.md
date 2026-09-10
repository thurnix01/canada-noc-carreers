# Remaining RCIP communities — n8n import

Import each workflow JSON from `n8n/`, attach Google Sheets credentials, run **Manual Run** once, then set **Active**.

| Community | Workflow JSON | Needs Extract PDF |
|---|---|---|
| Pictou County | `n8n/pictou-county-scrape.workflow.json` | Yes |
| Sudbury | `n8n/sudbury-scrape.workflow.json` | No |
| Sault Ste. Marie | `n8n/sault-ste-marie-scrape.workflow.json` | No |
| Altona/Rhineland | `n8n/altona-rhineland-scrape.workflow.json` | No |
| Brandon | `n8n/brandon-scrape.workflow.json` | No (enable **Ignore SSL Issues** on HTTP nodes — site has a broken cert chain) |
| Moose Jaw | `n8n/moose-jaw-scrape.workflow.json` | Yes |
| Claresholm | `n8n/claresholm-scrape.workflow.json` | No |

Rebuild from parsers:

```bash
node scripts/build-remaining-n8n-workflows.mjs
```

Local seed refresh:

```bash
npm run parse:pictou-county
npm run parse:sudbury
npm run parse:sault-ste-marie
npm run parse:altona-rhineland
npm run parse:brandon
npm run parse:moose-jaw
npm run parse:claresholm
npm run export:data && npm run deploy
```
