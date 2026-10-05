# SEO & Search Console checklist — noccareers.ca

Keep this lean: the product stays an RCIP referral layer. SEO should help discovery, not turn the site into a national NOC encyclopedia.

## Already on the site

- [x] Google Analytics (`G-JYJKRLTFBS`)
- [x] Microsoft Clarity
- [x] `robots.txt` → `https://noccareers.ca/robots.txt`
- [x] `sitemap.xml` → `https://noccareers.ca/sitemap.xml`
- [x] Title, meta description, canonical, Open Graph, Twitter cards
- [x] Basic `WebSite` JSON-LD in `web/index.html`

## Search Console (do once after deploy)

Property you verified: **Domain** `noccareers.ca`  
Console: [Search Console](https://search.google.com/search-console?resource_id=sc-domain%3Anoccareers.ca)

1. Open **Sitemaps** → submit `https://noccareers.ca/sitemap.xml`
2. Open **URL inspection** → enter `https://noccareers.ca/` → **Request indexing**
3. Confirm **Settings → users and permissions** includes your GA / Absolon account
4. Optional: link Analytics ↔ Search Console (Admin → Product links) so organic queries appear in GA
5. In 2–14 days, check **Pages** / **Indexing** for crawl errors (SPA one-pagers often show only the homepage — expected for now)

## Analytics (already set)

- [Analytics dashboard](https://analytics.google.com/analytics/web/?utm_source=OGB&utm_medium=app&authuser=0#/a410488972p557088361/reports/dashboard?params=_u..nav%3Dmaui&ruid=business-objectives-generate-leads-overview,business-objectives,generate-leads&collectionId=business-objectives&r=business-objectives-generate-leads-overview)
- Watch **Realtime** after deploy to confirm the new build is serving
- Prefer **outbound click** / engagement over vanity sessions for partnership talks

## What not to chase yet

- Hundreds of NOC article pages competing with Canada.ca / Job Bank
- Hash-only URLs (`#explore`) as separate sitemap entries — Google largely ignores fragments
- Paid ads until Wave 1 EDO outreach has replies

## Next SEO steps (only if traffic stays flat after ~4–6 weeks)

- Shareable community deep-links that work as real paths or query strings (product change — plan first)
- One blog/note per RCIP community with outbound links from settlement partners
- Confirm OG preview with [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) and LinkedIn Post Inspector using `https://noccareers.ca/images/nocc-header.jpg`
