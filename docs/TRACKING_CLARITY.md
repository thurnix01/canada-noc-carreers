# Tracking — Microsoft Clarity (do before public launch)

**Action item for you:** create a free [Microsoft Clarity](https://clarity.microsoft.com/) project and add the tracking script to the GitHub Pages React site.

## Why Clarity

Partner pitch promises **click metrics**. Clarity gives you:

- Heatmaps / session replays on NOC + community filters  
- Outbound click insight toward community portals, Job Bank, Indeed  
- No need for a heavy analytics stack in Phase 1  

## Setup checklist

1. Clarity project ID: `yg7sd6qv8d` (live in `web/index.html`)  
2. Redeploy GitHub Pages after any ID change  
3. Click a few “View official source” links and confirm they appear in Clarity  

Outbound links already use UTMs:

```text
?utm_source=rcip-aggregator&utm_medium=referral&utm_campaign=bc-pilot&utm_content={community}-{type}
```

## What not to track

- Do not collect immigration form PII on this site (read-only search + outbound links)  

## Related

- Partner language: `docs/PARTNER_PITCH.md`  
- Site deploy: `docs/SITE.md`

