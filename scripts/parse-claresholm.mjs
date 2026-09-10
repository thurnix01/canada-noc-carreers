/**
 * Claresholm RCIP parsers (HTML priority NOC list + designated employers).
 * Usage: node scripts/parse-claresholm.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMUNITY_ID = 'claresholm';
const YEAR = '2026';
const PORTAL_URL =
  'https://www.claresholm.ca/business/labour-resources/rural-community-immigration-pilot';
const UA = 'RCIPAggregatorBot/0.1 (+mailto:absolondesigns@gmail.com)';

const SECTOR_ONLY = /^\d+\s*[–—-]\s*(Health Care|Education|Manufacturing|Sales|Agriculture|Trades|Business|Law|Social)/i;

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
    3: 'Health',
    4: 'Education, law and social, community and government services',
    6: 'Sales and service',
    7: 'Trades and transport',
    8: 'Agriculture',
    9: 'Manufacturing and utilities',
  };
  return map[noc[0]] || '';
}

export function parsePriorityNocs(html, nowIso = new Date().toISOString()) {
  const out = [];
  const seen = new Set();
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRe.exec(html))) {
    const text = stripTags(m[1]);
    const nocMatch = text.match(/^(\d{5})\s*[–—-]\s*(.+)$/);
    if (!nocMatch) continue;
    const noc = nocMatch[1];
    if (seen.has(noc)) continue;
    if (SECTOR_ONLY.test(text)) continue;

    let rest = nocMatch[2].trim();
    let title = rest;
    let notes = '';
    const effective = rest.match(/^(.+?)\s*[–—-]\s*(Effective .+)$/i);
    if (effective) {
      title = effective[1].trim();
      notes = effective[2].trim();
    }

    seen.add(noc);
    out.push({
      record_id: `${COMMUNITY_ID}|${noc}|${YEAR}`,
      community_id: COMMUNITY_ID,
      noc_code: noc,
      noc_title: title,
      sector: sectorForNoc(noc),
      year: YEAR,
      is_secondary: 'FALSE',
      restriction_notes: notes,
      source_url: PORTAL_URL,
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

function parseEmployerLine(text) {
  const m = text.match(/^(.+?)\s*-\s*(\d+)\s*,\s*(.+?)\s*-\s*(NOT HIRING|HIRING)\s*$/i);
  if (!m) return null;
  return {
    name: m[1].trim(),
    sector: m[3].trim(),
    recruiting_status: /not/i.test(m[4]) ? 'not_hiring' : 'hiring',
  };
}

export function parseEmployers(html, nowIso = new Date().toISOString()) {
  const out = [];
  const seen = new Set();

  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRe.exec(html))) {
    const text = stripTags(m[1]);
    const parsed = parseEmployerLine(text);
    if (!parsed) continue;
    const key = parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      record_id: `${COMMUNITY_ID}|${normalizeIdPart(parsed.name)}`,
      community_id: COMMUNITY_ID,
      employer_name: parsed.name,
      locations: 'Claresholm, AB',
      sector: parsed.sector,
      recruiting_status: parsed.recruiting_status,
      source_url: PORTAL_URL,
      source_type: 'html',
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      status: 'active',
      manual_override: 'FALSE',
      review_status: 'new',
      notes: '',
    });
  }

  const divRe = /<div[^>]*>([^<]+ - \d+, [^<]+ - (?:NOT )?HIRING[^<]*)<\/div>/gi;
  while ((m = divRe.exec(html))) {
    const text = stripTags(m[1]);
    const parsed = parseEmployerLine(text);
    if (!parsed) continue;
    const key = parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      record_id: `${COMMUNITY_ID}|${normalizeIdPart(parsed.name)}`,
      community_id: COMMUNITY_ID,
      employer_name: parsed.name,
      locations: 'Claresholm, AB',
      sector: parsed.sector,
      recruiting_status: parsed.recruiting_status,
      source_url: PORTAL_URL,
      source_type: 'html',
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      status: 'active',
      manual_override: 'FALSE',
      review_status: 'new',
      notes: '',
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
  const pageRes = await fetch(PORTAL_URL, opts);
  const html = await pageRes.text();
  const nocs = parsePriorityNocs(html);
  const employers = parseEmployers(html);
  console.log(`Portal HTTP ${pageRes.status}: ${nocs.length} NOCs, ${employers.length} employers`);

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const seedDir = join(__dirname, '..', 'database', 'seeds');
  mkdirSync(seedDir, { recursive: true });
  writeFileSync(join(seedDir, `${COMMUNITY_ID}-priority-nocs.csv`), rowsToCsv(nocs, NOC_HEADERS));
  writeFileSync(join(seedDir, `${COMMUNITY_ID}-employers.csv`), rowsToCsv(employers, EMPLOYER_HEADERS));
  console.log('Wrote seeds to', seedDir);
}

const isDirect = process.argv[1] && process.argv[1].endsWith('parse-claresholm.mjs');
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
