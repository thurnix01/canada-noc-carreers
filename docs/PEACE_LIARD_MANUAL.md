# Peace Liard — why NOCs are manual (for now)

## Template

`database/peace-liard-priority-nocs-template.csv` — 25 blank rows.  
Fill `XXXXX` / titles / sectors, then **File → Import** into the Sheet `priority_nocs` tab (or copy-paste). Keep `manual_override=TRUE`.

## Why we can’t scrape https://www.nebcimmigration.ca/priority-occupations like WK/NOS

West Kootenay and North Okanagan publish priority NOCs as **HTML tables** (or a PDF with selectable text). A normal HTTP fetch returns the codes and titles as text, so n8n can parse them.

Peace Liard’s priority page is different:

1. It says the **2026 eligibility list is “available below”**, and lists the **sectors** as text.  
2. The actual **25 NOC codes/titles are not in the HTML** we download — there are **zero** `NOC 12345`-style values in the page source.  
3. After “25 priority occupations”, the markup jumps to the disclaimer. So the list you see in a browser is almost certainly a **Wix visual** (image, embedded graphic, or client-only widget), not a text table.  
4. Scrapers (and n8n HTTP Request) only get the HTML shell — **not** what your eyes read off an image.

So it’s not that the site is “forbidden”; it’s that **there’s nothing reliable to import as text**.

### What we *can* automate later

Their **Designated Employers** PDF (linked from the candidates/employers area) **does** contain extractable text (~280 employers as of April 2026). That can get an n8n adapter like NOS. Priority NOCs are the hard part.

### Ways to unlock NOC automation later

- They publish a **PDF or HTML table** of the 25 NOCs (best — ask in partner pitch)  
- Or we add a one-time **OCR** step from a screenshot (more brittle; do only if needed)

Until then: fill the CSV template manually from the page you see in the browser.
