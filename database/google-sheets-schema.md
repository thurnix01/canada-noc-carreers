# Google Sheets schema — RCIP curated aggregator

Live spreadsheet:  
https://docs.google.com/spreadsheets/d/1H3RDFGINQ-lBVaR_EOn1LDU4ezWf7q2bfY5XnUAFZpo/edit  

Sheet ID: `1H3RDFGINQ-lBVaR_EOn1LDU4ezWf7q2bfY5XnUAFZpo`

Import the matching `*-headers.csv` files in this folder as row 1 of each tab.

## Tabs

| Tab | Purpose |
|---|---|
| `database` | Registry of RCIP communities (pilot + future). *Named `database` in the live sheet; same columns as `communities-headers.csv`.* |
| `priority_nocs` | Eligible / priority NOC codes per community |
| `employers` | Designated employers |
| `jobs` | Open / advertised roles (when known) |
| `run_log` | Scraper / import run stats |
| `config` | Key/value settings for n8n |

n8n should read communities from tab **`database`**, not `communities`.

Manual overrides: set `review_status` / `manual_override` so bad scrapes can be fixed without code (same ops habit as outreach scanner).

---

## Tab: `communities`

| Column | Description |
|---|---|
| `community_id` | Stable slug, e.g. `west-kootenay` |
| `name` | Display name |
| `province` | `BC`, `ON`, … |
| `canada_ca_label` | Exact Canada.ca dropdown label |
| `portal_url` | Canonical community site |
| `portal_alias_urls` | Pipe-separated aliases |
| `operator` | ED org / Community Futures name |
| `priority_nocs_url` | Page or PDF for priorities |
| `employers_url` | Page or PDF for designated employers |
| `jobs_url` | Find-a-job / vacancies page if any |
| `scrape_status` | `ready` \| `manual` \| `blocked` \| `todo` |
| `notes` | Free text |
| `active` | `TRUE` / `FALSE` |

---

## Tab: `priority_nocs`

| Column | Description |
|---|---|
| `record_id` | `{community_id}|{noc_code}|{year}` |
| `community_id` | FK → communities |
| `noc_code` | 5-digit NOC |
| `noc_title` | Official or community-published title |
| `sector` | Priority sector label |
| `year` | e.g. `2026` |
| `is_secondary` | `TRUE` if secondary NOC (NOS) |
| `restriction_notes` | Caps, pauses, subsector bans |
| `source_url` | Page/PDF |
| `source_type` | `html` \| `pdf` \| `manual` |
| `first_seen_at` | ISO timestamp |
| `last_seen_at` | ISO timestamp |
| `status` | `active` \| `stale` \| `removed` |
| `manual_override` | `TRUE` to protect row from scrape overwrite |
| `review_status` | `new` \| `ok` \| `needs_review` |

---

## Tab: `employers`

| Column | Description |
|---|---|
| `record_id` | `{community_id}|{normalized_name}` (or hash) |
| `community_id` | FK |
| `employer_name` | As published |
| `locations` | Towns / sites if listed |
| `sector` | Priority sector if listed |
| `recruiting_status` | `unknown` \| `recruiting` \| `not_recruiting` \| `de_designated` |
| `source_url` | |
| `source_type` | `html` \| `pdf` \| `manual` |
| `first_seen_at` | |
| `last_seen_at` | |
| `status` | `active` \| `stale` \| `removed` |
| `manual_override` | |
| `review_status` | |
| `notes` | e.g. “gas stations de-designated 2026” |

---

## Tab: `jobs`

| Column | Description |
|---|---|
| `record_id` | Stable id or URL hash |
| `community_id` | FK |
| `job_title` | |
| `noc_code` | If known |
| `employer_name` | |
| `location` | |
| `source_url` | Apply / posting URL |
| `source_name` | `job_bank` \| `indeed` \| `employer` \| `community` \| `manual` |
| `posted_at` | If known |
| `first_seen_at` | |
| `last_seen_at` | |
| `status` | `active` \| `stale` \| `closed` |
| `manual_override` | |
| `review_status` | |
| `notes` | |

If no real vacancy exists, do **not** invent job rows. Use UI copy + community `jobs_url` instead.

---

## Tab: `run_log`

| Column | Description |
|---|---|
| `run_id` | UUID or timestamp |
| `started_at` | |
| `finished_at` | |
| `community_id` | Or `all` |
| `adapter` | e.g. `wk-html-employers` |
| `rows_upserted` | |
| `rows_stale` | |
| `errors` | Short message |
| `ok` | `TRUE` / `FALSE` |

---

## Tab: `config`

| key | example | description |
|---|---|---|
| `pilot_communities` | `west-kootenay,north-okanagan-shuswap,peace-liard` | Comma list |
| `crawl_delay_ms` | `3000` | Min delay between requests |
| `user_agent` | `RCIPAggregatorBot/0.1 (+mailto:you@domain)` | Identify the bot |
| `export_path` | `public/data/listings.json` | GitHub Pages feed |
| `clarity_note` | `Install Microsoft Clarity before launch` | Ops reminder |
| `utm_source` | `rcip-aggregator` | Outbound UTMs |
| `last_export_at` | ISO | Watermark |

---

## n8n write rules

1. Upsert on `record_id` (do not blindly append duplicates).  
2. If a previously `active` row is missing from a successful scrape → set `status=stale` (unless `manual_override=TRUE`).  
3. Never delete rows from `run_log`.  
4. After a successful run, export JSON for the static site (Phase 2).
