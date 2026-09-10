/**
 * Altona/Rhineland RCIP parsers (HTML priority NOC table + designated employers list).
 * Usage: node scripts/parse-altona-rhineland.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMUNITY_ID = 'altona-rhineland';
const YEAR = '2026';
const NOC_URL = 'https://ared-rpga.com/immigration/rcip-sector/';
const EMPLOYERS_URL = 'https://ared-rpga.com/immigration/rcip-employers/';
const UA = 'RCIPAggregatorBot/0.1 (+mailto:absolondesigns@gmail.com)';

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, "'")
    .replace(/&#038;/g, '&')
    .replace(/&rsquo;/g, "'")
    .replace(/&[a-z]+;/gi, ' ');
}

function stripTags(html) {
  return decodeEntities(String(html || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeIdPart(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows, headers) {
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  return lines.join('\n') + '\n';
}

export function parsePriorityNocs(html, nowIso = new Date().toISOString()) {
  const out = [];
  const seen = new Set();
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(html))) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
      stripTags(c[1]),
    );
    if (cells.length < 2) continue;
    const noc = cells[0].match(/\d{5}/)?.[0];
    if (!noc || seen.has(noc)) continue;
    const title = cells[1];
    if (!title || /occupation name|national occupation/i.test(title)) continue;
    seen.add(noc);
    const sector = cells[2] || '';

    out.push({
      record_id: `${COMMUNITY_ID}|${noc}|${YEAR}`,
      community_id: COMMUNITY_ID,
      noc_code: noc,
      noc_title: title,
      sector,
      year: YEAR,
      is_secondary: 'FALSE',
      restriction_notes: '',
      source_url: NOC_URL,
      source_type: 'html',
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      status: 'active',
      manual_override: 'FALSE',
      review_status: 'new',
    });
  }
  return out.sort((a, b) => a.noc_code.localeCompare(b.noc_code));
}

export function parseEmployers(html, nowIso = new Date().toISOString()) {
  const start = html.indexOf('List of Designated Employers');
  const chunk = start >= 0 ? html.slice(start) : html;
  const re = /<div class="td-content">\s*([\s\S]*?)\s*<\/div>/g;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(chunk))) {
    let text = decodeEntities(m[1].replace(/\s+/g, ' ').trim());
    if (!text || text.length < 3) continue;

    let recruiting_status = 'unknown';
    if (/\s*[–—-]\s*Not Currently Hiring\s*$/i.test(text)) {
      recruiting_status = 'not_hiring';
      text = text.replace(/\s*[–—-]\s*Not Currently Hiring\s*$/i, '').trim();
    }

    const key = text.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);

    out.push({
      record_id: `${COMMUNITY_ID}|${normalizeIdPart(text)}`,
      community_id: COMMUNITY_ID,
      employer_name: text,
      locations: 'Altona/Rhineland, MB',
      sector: '',
      recruiting_status,
      source_url: EMPLOYERS_URL,
      source_type: 'html',
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      status: 'active',
      manual_override: 'FALSE',
      review_status: 'new',
      notes: recruiting_status === 'not_hiring' ? 'Source marks employer as not currently hiring.' : '',
    });
  }
  return out.sort((a, b) => a.employer_name.localeCompare(b.employer_name));
}

export function mergeUpserts(scraped, existingRows, communityId = COMMUNITY_ID) {
  const existingById = new Map();
  for (const row of existingRows) {
    const id = (row.record_id || '').toString();
    if (id) existingById.set(id, row);
  }
  const scrapedIds = new Set(scraped.map((r) => r.record_id));
  const nowIso = new Date().toISOString();
  const upserts = [];
  for (const row of scraped) {
    const prev = existingById.get(row.record_id);
    if (prev && String(prev.manual_override).toUpperCase() === 'TRUE') continue;
    if (prev) {
      upserts.push({
        ...row,
        first_seen_at: prev.first_seen_at || row.first_seen_at,
        last_seen_at: nowIso,
        review_status: prev.review_status === 'ok' ? 'ok' : 'new',
        manual_override: prev.manual_override || 'FALSE',
      });
    } else upserts.push(row);
  }
  const stale = [];
  for (const [id, prev] of existingById) {
    if (scrapedIds.has(id)) continue;
    if (String(prev.manual_override).toUpperCase() === 'TRUE') continue;
    if ((prev.community_id || '') !== communityId) continue;
    if (prev.status === 'stale' || prev.status === 'removed') continue;
    stale.push({ ...prev, status: 'stale', last_seen_at: nowIso, review_status: 'needs_review' });
  }
  return { upserts, stale };
}

const NOC_HEADERS = [
  'record_id',
  'community_id',
  'noc_code',
  'noc_title',
  'sector',
  'year',
  'is_secondary',
  'restriction_notes',
  'source_url',
  'source_type',
  'first_seen_at',
  'last_seen_at',
  'status',
  'manual_override',
  'review_status',
];

const EMPLOYER_HEADERS = [
  'record_id',
  'community_id',
  'employer_name',
  'locations',
  'sector',
  'recruiting_status',
  'source_url',
  'source_type',
  'first_seen_at',
  'last_seen_at',
  'status',
  'manual_override',
  'review_status',
  'notes',
];

async function main() {
  const opts = { headers: { 'User-Agent': UA, Accept: 'text/html' } };
  const [nocRes, empRes] = await Promise.all([fetch(NOC_URL, opts), fetch(EMPLOYERS_URL, opts)]);
  const nocs = parsePriorityNocs(await nocRes.text());
  const employers = parseEmployers(await empRes.text());
  console.log(`NOC HTTP ${nocRes.status}: ${nocs.length} NOCs`);
  console.log(`Employers HTTP ${empRes.status}: ${employers.length} employers`);

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const seedDir = join(__dirname, '..', 'database', 'seeds');
  mkdirSync(seedDir, { recursive: true });
  writeFileSync(join(seedDir, `${COMMUNITY_ID}-priority-nocs.csv`), rowsToCsv(nocs, NOC_HEADERS));
  writeFileSync(join(seedDir, `${COMMUNITY_ID}-employers.csv`), rowsToCsv(employers, EMPLOYER_HEADERS));
  console.log('Wrote seeds to', seedDir);
}

const isDirect = process.argv[1] && process.argv[1].endsWith('parse-altona-rhineland.mjs');
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
