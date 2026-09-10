/**
 * Greater Sudbury RCIP parsers (HTML priority NOCs + designated employers).
 * Usage: node scripts/parse-sudbury.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMUNITY_ID = 'sudbury';
const YEAR = '2026';
const PORTAL_URL = 'https://investsudbury.ca/why-sudbury/newcomers/rcipfcip/';
const UA = 'RCIPAggregatorBot/0.1 (+mailto:absolondesigns@gmail.com)';

const SECTORS = [
  'Business, Finance, and Administration',
  'Natural and Applied Sciences',
  'Health',
  'Education, Social, Community, and Government Services',
  'Arts, Culture, Recreation and Sport',
  'Trades and Transport',
  'Natural Resources and Agriculture',
].sort((a, b) => b.length - a.length);

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
  const map = {
    1: 'Business, finance and administration',
    2: 'Natural and applied sciences and related occupations',
    3: 'Health',
    4: 'Education, law and social, community and government services',
    6: 'Sales and service',
    7: 'Trades and transport',
    8: 'Natural resources, agriculture and related production occupations',
    9: 'Manufacturing and utilities',
  };
  return map[noc[0]] || '';
}

function splitNameAddr(text) {
  const addrRe =
    /(\d{1,5}[A-Za-z]?(?:\s*[-–—]\s*)?\d*\s+[A-Za-z][\w\s,.'()-]*(?:ON|Ontario|P\d[A-Z]\s?\d[A-Z]\d))/i;
  const m = text.match(addrRe);
  if (m && m.index > 0) {
    return { name: text.slice(0, m.index).trim(), addr: m[0].trim() };
  }
  const inline = text.match(/^(\d{7,}\s+Canada Inc\.?)(.+)$/i);
  if (inline) {
    const addr2 = inline[2].match(addrRe);
    if (addr2) {
      return {
        name: inline[1].trim(),
        addr: inline[2].slice(addr2.index).trim(),
      };
    }
  }
  return { name: text.trim(), addr: '' };
}

function isJunkEmployerName(name) {
  const n = String(name || '').trim();
  if (n.length < 3) return true;
  if (/^(not hiring|rcip)$/i.test(n)) return true;
  if (/[–—-]\s*$/.test(n) && n.length < 30) return true;
  return false;
}

export function parsePriorityNocs(html, nowIso = new Date().toISOString()) {
  const rcipStart = html.indexOf('Priority Occupations:', 50000);
  const fcipStart = html.indexOf('FCIP', rcipStart + 100);
  const chunk = html.slice(rcipStart, fcipStart > rcipStart ? fcipStart : rcipStart + 25000);

  const out = [];
  const seen = new Set();
  const re = /(\d{5})\s*(?:&#8211;|–|—|-)\s*([^|<]{3,100})/g;
  let m;
  while ((m = re.exec(chunk))) {
    const noc = m[1];
    const title = decodeEntities(m[2].trim());
    if (seen.has(noc)) continue;
    if (/data-vc|\.png|js-before|rel="prev"/i.test(title)) continue;
    seen.add(noc);
    out.push({
      record_id: `${COMMUNITY_ID}|${noc}|${YEAR}`,
      community_id: COMMUNITY_ID,
      noc_code: noc,
      noc_title: title,
      sector: sectorForNoc(noc),
      year: YEAR,
      is_secondary: 'FALSE',
      restriction_notes: '',
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

export function parseEmployers(html, nowIso = new Date().toISOString()) {
  const start = html.indexOf('Designated Employers', 60000);
  let end = html.indexOf('FCIP', start + 5000);
  if (end < start) end = html.length;
  let chunk = html.slice(start, end);
  chunk = chunk
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#038;/g, '&')
    .replace(/&#8211;/g, '–')
    .replace(/&nbsp;/g, ' ');

  const lines = chunk
    .split('\n')
    .map((l) => decodeEntities(l.trim()))
    .filter((l) => l.length > 2 && !/^(Designated Employers|RCIP)$/i.test(l));

  let sector = '';
  let pendingNotHiring = false;
  const rawRows = [];

  for (const line of lines) {
    if (/^Not hiring$/i.test(line)) {
      pendingNotHiring = true;
      continue;
    }

    let rest = line;
    let matchedSector = '';
    for (const s of SECTORS) {
      if (rest.startsWith(s)) {
        matchedSector = s;
        rest = rest.slice(s.length);
        break;
      }
    }
    if (matchedSector) sector = matchedSector;

    if (/^\d{1,5}[A-Za-z]?\s/.test(rest) && rawRows.length && !matchedSector) {
      rawRows[rawRows.length - 1].addr += ' | ' + rest;
      continue;
    }

    const { name, addr } = splitNameAddr(rest);
    if (isJunkEmployerName(name)) continue;
    if (/^Not hiring/i.test(name)) {
      const r2 = splitNameAddr(name.replace(/^Not hiring\s*/i, ''));
      rawRows.push({ ...r2, sector, notHiring: true });
      pendingNotHiring = false;
      continue;
    }

    rawRows.push({
      name,
      addr: addr || 'Greater Sudbury, ON',
      sector,
      notHiring: pendingNotHiring,
    });
    pendingNotHiring = false;
  }

  const seen = new Set();
  const out = [];
  for (const row of rawRows) {
    const key = row.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const locKey = (row.addr || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40);
    const idKey = `${key}|${locKey}`;
    if (!key || seen.has(idKey)) continue;
    seen.add(idKey);

    const recordSuffix = locKey
      ? `${normalizeIdPart(row.name)}-${locKey.slice(0, 24)}`
      : normalizeIdPart(row.name);

    out.push({
      record_id: `${COMMUNITY_ID}|${recordSuffix}`.slice(0, 120),
      community_id: COMMUNITY_ID,
      employer_name: row.name,
      locations: row.addr || 'Greater Sudbury, ON',
      sector: row.sector || '',
      recruiting_status: row.notHiring ? 'not_hiring' : 'unknown',
      source_url: PORTAL_URL,
      source_type: 'html',
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      status: 'active',
      manual_override: 'FALSE',
      review_status: 'new',
      notes: row.notHiring ? 'Source marks employer as not hiring.' : '',
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

const isDirect = process.argv[1] && process.argv[1].endsWith('parse-sudbury.mjs');
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
