/**
 * Brandon RCIP parsers (HTML priority NOC list + designated employers table).
 * Usage: node scripts/parse-brandon.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMUNITY_ID = 'brandon';
const YEAR = '2026';
const NOC_URL = 'https://economicdevelopmentbrandon.com/rcip/rcip-sector-labour-market-priorities-list';
const EMPLOYERS_URL = 'https://economicdevelopmentbrandon.com/rcip/rcip-list-of-designated-employers';
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

function sectorForNoc(noc) {
  const map = {
    1: 'Business, finance and administration',
    2: 'Natural and applied sciences and related occupations',
    3: 'Health',
    4: 'Education, law and social, community and government services',
    6: 'Sales and service',
    7: 'Trades and transport',
    9: 'Manufacturing and utilities',
  };
  return map[noc[0]] || '';
}

export function parsePriorityNocs(html, nowIso = new Date().toISOString()) {
  const out = [];
  const seen = new Set();
  const text = html.replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ');
  const lines = text.split('\n').map((l) => decodeEntities(l.trim())).filter(Boolean);

  for (const line of lines) {
    const m = line.match(/^(\d{5})\s*[-–—]\s*(.+)$/);
    if (!m) continue;
    const noc = m[1];
    if (seen.has(noc)) continue;
    seen.add(noc);
    out.push({
      record_id: `${COMMUNITY_ID}|${noc}|${YEAR}`,
      community_id: COMMUNITY_ID,
      noc_code: noc,
      noc_title: m[2].trim(),
      sector: sectorForNoc(noc),
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

function hiringStatus(name, notes) {
  const combined = `${name} ${notes}`.toLowerCase();
  if (/not hiring|not seeking|do not contact|existing employees only|support existing employees only|leveraging.*existing employees only/i.test(combined))
    return 'not_hiring';
  if (/is hiring|are hiring|seeking to hire/i.test(combined)) return 'hiring';
  return 'unknown';
}

export function parseEmployers(html, nowIso = new Date().toISOString()) {
  const idx = html.indexOf('Designated Employers');
  const chunk = idx >= 0 ? html.slice(idx, idx + 120000) : html;
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = trRe.exec(chunk))) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
      stripTags(c[1]),
    );
    if (!cells.length) continue;
    const name = cells[0];
    const notes = (cells[1] || '').trim();
    if (!name || /^(Designated Employers|Notes)$/i.test(name)) continue;
    if (/^note to foreign|^date modified|^see faq|^see rcip/i.test(name)) continue;

    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);

    out.push({
      record_id: `${COMMUNITY_ID}|${normalizeIdPart(name)}`,
      community_id: COMMUNITY_ID,
      employer_name: name,
      locations: 'Brandon, MB',
      sector: '',
      recruiting_status: hiringStatus(name, notes),
      source_url: EMPLOYERS_URL,
      source_type: 'html',
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      status: 'active',
      manual_override: 'FALSE',
      review_status: 'new',
      notes: notes ? notes.slice(0, 300) : '',
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

async function fetchPage(url) {
  const opts = { headers: { 'User-Agent': UA, Accept: 'text/html' } };
  try {
    const res = await fetch(url, opts);
    return { status: res.status, text: await res.text() };
  } catch (err) {
    if (err?.cause?.code !== 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') throw err;
    return new Promise((resolve, reject) => {
      https
        .get(url, { ...opts, rejectUnauthorized: false }, (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => resolve({ status: res.statusCode || 0, text: body }));
        })
        .on('error', reject);
    });
  }
}

async function main() {
  const [nocRes, empRes] = await Promise.all([fetchPage(NOC_URL), fetchPage(EMPLOYERS_URL)]);
  const nocs = parsePriorityNocs(nocRes.text);
  const employers = parseEmployers(empRes.text);
  console.log(`NOC HTTP ${nocRes.status}: ${nocs.length} NOCs`);
  console.log(`Employers HTTP ${empRes.status}: ${employers.length} employers`);

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const seedDir = join(__dirname, '..', 'database', 'seeds');
  mkdirSync(seedDir, { recursive: true });
  writeFileSync(join(seedDir, `${COMMUNITY_ID}-priority-nocs.csv`), rowsToCsv(nocs, NOC_HEADERS));
  writeFileSync(join(seedDir, `${COMMUNITY_ID}-employers.csv`), rowsToCsv(employers, EMPLOYER_HEADERS));
  console.log('Wrote seeds to', seedDir);
}

const isDirect = process.argv[1] && process.argv[1].endsWith('parse-brandon.mjs');
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
