/**
 * North Bay & Area RCIP parsers (HTML NOC table + Monday.com employer JSON via WP ajax).
 * Usage: node scripts/parse-north-bay.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMUNITY_ID = 'north-bay';
const YEAR = '2026';
const EMPLOYERS_URL = 'https://nbrcip.ca/employers/';
const DESIGNATED_URL = 'https://nbrcip.ca/designated-employers/';
const EMPLOYERS_API = 'https://nbrcip.ca/wp-admin/admin-ajax.php?action=load_monday_data';
const UA = 'RCIPAggregatorBot/0.1 (+mailto:absolondesigns@gmail.com)';

const HEALTH_NOCS = new Set(['31301', '32101', '33100', '33102', '33103']);

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

function sectorForNoc(noc) {
  const p = noc[0];
  const map = {
    1: 'Business, finance and administration',
    2: 'Natural and applied sciences and related occupations',
    3: 'Health',
    4: 'Education, law and social, community and government services',
    6: 'Sales and service',
    7: 'Trades, transport and equipment operators and related occupations',
    9: 'Trades, transport and equipment operators and related occupations',
  };
  return map[p] || '';
}

export function parsePriorityNocs(html, nowIso = new Date().toISOString()) {
  const out = [];
  const seen = new Set();
  // Prefer the sortable occupation table
  const tableMatch = html.match(/id="occupation-table"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i);
  const body = tableMatch ? tableMatch[1] : html;
  const rowRe = /<tr[^>]*>\s*<td[^>]*>\s*(\d{5})\s*<\/td>\s*<td[^>]*>\s*([\s\S]*?)\s*<\/td>\s*<\/tr>/gi;
  let m;
  while ((m = rowRe.exec(body))) {
    const noc = m[1];
    if (seen.has(noc)) continue;
    seen.add(noc);
    const title = decodeEntities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    const notes = [
      HEALTH_NOCS.has(noc)
        ? 'Designated employers in healthcare may submit up to 5 candidates per year (others up to 3).'
        : 'Designated employers may submit up to 3 candidates per year (healthcare up to 5).',
      'Fast food and retail (incl. convenience / gas station) occupations are excluded from this pilot.',
    ].join(' | ');

    out.push({
      record_id: `${COMMUNITY_ID}|${noc}|${YEAR}`,
      community_id: COMMUNITY_ID,
      noc_code: noc,
      noc_title: title,
      sector: sectorForNoc(noc),
      year: YEAR,
      is_secondary: 'FALSE',
      restriction_notes: notes,
      source_url: EMPLOYERS_URL,
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

export function parseEmployersFromApi(data, nowIso = new Date().toISOString()) {
  const rows = Array.isArray(data) ? data : [];
  const seen = new Set();
  const out = [];
  for (const item of rows) {
    const name = String(item.name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const statusRaw = String(item.status || '').trim();
    const notHiring = /not\s*hiring/i.test(statusRaw);
    const hiring = /^hiring$/i.test(statusRaw);

    out.push({
      record_id: `${COMMUNITY_ID}|${normalizeIdPart(name)}`,
      community_id: COMMUNITY_ID,
      employer_name: name,
      locations: 'North Bay & Area, ON',
      sector: String(item.color || '').trim(),
      recruiting_status: notHiring ? 'not_hiring' : hiring ? 'hiring' : 'unknown',
      source_url: DESIGNATED_URL,
      source_type: 'api',
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      status: 'active',
      manual_override: 'FALSE',
      review_status: 'new',
      notes: statusRaw ? `Source status: ${statusRaw}` : '',
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
  const opts = { headers: { 'User-Agent': UA, Accept: 'text/html,application/json' } };
  const [pageRes, apiRes] = await Promise.all([
    fetch(EMPLOYERS_URL, opts),
    fetch(EMPLOYERS_API, opts),
  ]);
  const html = await pageRes.text();
  const apiJson = await apiRes.json();
  const nocs = parsePriorityNocs(html);
  const employers = parseEmployersFromApi(apiJson);
  console.log(`Employers page HTTP ${pageRes.status}: ${nocs.length} NOCs`);
  console.log(nocs.slice(0, 2));
  console.log(`Employers API HTTP ${apiRes.status}: ${employers.length}`);
  console.log(employers.slice(0, 3));

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const seedDir = join(__dirname, '..', 'database', 'seeds');
  mkdirSync(seedDir, { recursive: true });
  writeFileSync(join(seedDir, 'north-bay-priority-nocs.csv'), rowsToCsv(nocs, NOC_HEADERS));
  writeFileSync(join(seedDir, 'north-bay-employers.csv'), rowsToCsv(employers, EMPLOYER_HEADERS));
  console.log('Wrote seeds to', seedDir);
}

const isDirect = process.argv[1] && process.argv[1].endsWith('parse-north-bay.mjs');
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
