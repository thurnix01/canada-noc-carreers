# Phase 0 discovery — BC pilot portals

Discovery date: **2026-09-09**  
Pilot communities: West Kootenay · North Okanagan–Shuswap · Peace Liard  
IRCC directory: https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/rural-franco-pilots/rural-immigration/job-offer.html

## Summary matrix

| Community | Platform | Priority NOCs | Designated employers | Open jobs on portal | Scrape difficulty |
|---|---|---|---|---|---|
| West Kootenay | WordPress (`westkootenayimmigration.ca`; `wk-rnip.ca` redirects) | HTML on `/priorities/` (~25+ codes by sector) | HTML tables on `/designated-employers/` (updated e.g. 2026-06-29) | **No job board** — guides to Indeed, Job Bank, local sites, ECE recruitment partners | **Low** for NOCs + employers |
| North Okanagan–Shuswap | WordPress | HTML on `/priority-sectors-nocs/` (25 primary + secondary rules) | **PDF** (monthly), e.g. Designated Employer List July 31, 2026 | **No job board** — FAQ: apply to public vacancies only; Employer Platform at `rcip.northstarats.com` (employer-side) | **Low** HTML NOCs; **Medium** PDF employers |
| Peace Liard (Northeast BC) | Wix (`nebcimmigration.ca`) | Page says 25 NOCs / 5–6 sectors; **list appears non-text** (image/embedded — not reliably in HTML) | Process + PDFs on `/employers`; public DE list needs confirmation on site/PDF | **No candidate job board** — employer-driven offers | **High** (Wix + image/PDF); plan **manual Sheet entry** or PDF/OCR later |

## Shared candidate guidance (product must respect)

All three communities emphasize:

- RCIP is **employer-driven**; offices generally **do not match** candidates to jobs.
- Designated ≠ currently hiring.
- **Do not solicit** designated employers unless a position is **publicly advertised**.
- Cross-check **Job Bank** / public postings with designation + priority NOC/sector.

Aggregator UX should push **posted jobs + official portals**, not “email every employer.”

## Per-community detail

### 1. West Kootenay, BC

| Field | Value |
|---|---|
| Canada.ca label | West Kootenay, BC |
| Canonical site | https://westkootenayimmigration.ca/ |
| Alias | https://wk-rnip.ca/ → redirects to canonical |
| Delivered by | Community Futures Central Kootenay |
| Priority NOCs | https://westkootenayimmigration.ca/priorities/ |
| Employers | https://westkootenayimmigration.ca/designated-employers/ |
| Job guidance | https://westkootenayimmigration.ca/find-a-job/ |
| Forms/PDFs | https://westkootenayimmigration.ca/guides-checklists-forms/ |
| robots.txt | Crawl-delay **3**; Disallow query strings `/*?` |
| Adapter notes | Parse HTML tables for employers by sector; parse priority page for 5-digit NOCs + titles. Job rows = optional Job Bank/Indeed search links (not scraped listings). |

Example public job pointers (not listings): Indeed.ca, Job Bank, WelcomeBC, ISSofBC, Kootenay Childcare Initiative / Kootenay Talent + Recruitment (ECE).

### 2. North Okanagan–Shuswap, BC

| Field | Value |
|---|---|
| Canonical site | https://rcipnorthokanaganshuswap.com/ |
| Delivered by | Community Futures North Okanagan + Community Futures Shuswap |
| Priority NOCs | https://rcipnorthokanaganshuswap.com/priority-sectors-nocs/ |
| Employers PDF (example) | https://rcipnorthokanaganshuswap.com/wp-content/uploads/2026/08/RCIP-North-Okanagan-Shuswap-Designated-Employer-List-July-31-2026.pdf |
| Resources hub | https://rcipnorthokanaganshuswap.com/resources-and-policies/ |
| Employer platform | https://rcip.northstarats.com/ (not a public candidate job board) |
| robots.txt | Allow all; sitemap present |
| Adapter notes | HTML scrape for 25 priority NOCs + restriction notes; PDF parse for designated employers (filename/date changes monthly — discover latest PDF from Resources page). |

### 3. Peace Liard (Northeast BC)

| Field | Value |
|---|---|
| Canonical site | https://www.nebcimmigration.ca/ |
| Priority page | https://www.nebcimmigration.ca/priority-occupations |
| Employers | https://www.nebcimmigration.ca/employers |
| Candidates | https://www.nebcimmigration.ca/candidates |
| robots.txt | Allow `/`; Disallow `*?lightbox=` |
| Adapter notes | Wix HTML is heavy/JS-oriented. Priority NOC **numbers not extractable as clean text** from static HTML (2026-09-09). Use **manual curation** into Sheets for Phase 1, or later PDF/OCR. Confirm whether a public designated-employer list is published as downloadable PDF. |

## Data availability vs product layers

| Listing type | WK | NOS | Peace Liard |
|---|---|---|---|
| `priority_noc` | Automate HTML | Automate HTML | Manual / later PDF-OCR |
| `employer` | Automate HTML | Automate PDF | Manual / PDF when confirmed |
| `job` | Rare on-portal; link out to Job Bank/Indeed + community find-a-job page | Rare; link out + FAQ guidance | Rare; link out |

“All three” product layers are still correct: for `job`, Phase 1 may be **curated outbound search links** and any explicitly published vacancies, not a full scrape of Indeed.

## Compliance checklist (scrapers)

- [x] Prefer public pages only  
- [x] Honour robots.txt (WK crawl-delay 3)  
- [ ] Identify User-Agent string in n8n HTTP nodes  
- [ ] Store source_url + scraped_at; do not mirror full PDFs on the public site  
- [ ] Show disclaimer + “verify on official site”  
- [ ] Track outbound clicks (see Microsoft Clarity note below)

## Microsoft Clarity — click metrics (do this at launch)

**Reminder for you:** install [Microsoft Clarity](https://clarity.microsoft.com/) on the GitHub Pages site to track:

1. Session replays / heatmaps on search and filter use  
2. **Outbound clicks** to community portals, Job Bank, Indeed, employer career pages  
3. Which communities and NOC filters get the most use  

Optional complement: UTM tags on outbound links  
`?utm_source=rcip-aggregator&utm_medium=referral&utm_campaign=bc-pilot`  
so partner offices can see referrals in *their* analytics too.

Add Clarity project ID to site env / `index.html` before public launch; do not block launch on partner dashboards — Clarity alone is enough for your pitch metrics.

## Phase 1 build order (adapters)

1. Registry + Sheets schema (this repo)  
2. Manual seed of Peace Liard NOCs if still image-only  
3. n8n: WK priorities + designated employers  
4. n8n: NOS priorities + latest employer PDF  
5. Export `public/data/listings.json` → React one-pager on GitHub Pages  
6. Clarity + outbound UTMs  
7. Send `docs/PARTNER_PITCH.md` to the three offices
