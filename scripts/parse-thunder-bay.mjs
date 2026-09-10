/**
 * Thunder Bay CMA RCIP parsers (HTML priority NOCs + designated employers PDF).
 * Usage: node scripts/parse-thunder-bay.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFParse } from 'pdf-parse';

const COMMUNITY_ID = 'thunder-bay';
const YEAR = '2026';
const PORTAL_URL = 'https://gotothunderbay.ca/rural-community-immigration-pilot-rcip/';
const FALLBACK_PDF =
  'https://gotothunderbay.ca/wp-content/uploads/2026/08/As-of-August-13-2026.pdf';
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
    3: 'Health',
    4: 'Education, law and social, community and government services',
    6: 'Sales and service',
    7: 'Trades and transport',
    9: 'Manufacturing and utilities',
  };
  return map[noc[0]] || '';
}

export function findEmployerListPdf(html) {
  const urls = [];
  const hrefRe = /href="(https?:\/\/[^"]+\.pdf[^"]*|\/[^"]+\.pdf[^"]*)"/gi;
  let m;
  while ((m = hrefRe.exec(html))) {
    let url = m[1];
    if (url.startsWith('/')) url = 'https://gotothunderbay.ca' + url;
    urls.push(url);
  }
  const designated = urls.filter(
    (u) => /as-of-|designated.?employer|employer.?list/i.test(u) && !/scoring|cma\.pdf/i.test(u),
  );
  if (designated.length) {
    designated.sort();
    return designated.at(-1);
  }
  const asOf = urls.filter((u) => /\/20\d{2}\/\d{2}\/As-of-/i.test(u));
  if (asOf.length) {
    asOf.sort();
    return asOf.at(-1);
  }
  return FALLBACK_PDF;
}

export function parsePriorityNocs(html, nowIso = new Date().toISOString()) {
  const out = [];
  const seen = new Set();
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRe.exec(html))) {
    const text = stripTags(m[1]);
    const nocMatch = text.match(/^(\d{5})\s*[–—-]\s*(.+)$/) || text.match(/^(\d{5})\s+(.+)$/);
    if (!nocMatch) continue;
    const noc = nocMatch[1];
    if (seen.has(noc)) continue;
    seen.add(noc);

    let rest = nocMatch[2].trim();
    let title = rest;
    let notes = '';
    const dash = rest.match(/^([^–—-]+?)\s*[–—-]\s*(.+)$/);
    if (dash && /limit|only|short haul|electronic|dine-in|hotel|employer/i.test(dash[2])) {
      title = dash[1].trim();
      notes = dash[2].trim();
    }

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

function looksLikeAddress(line) {
  const s = String(line || '').trim();
  if (!s) return false;
  if (/^(unit|suite)\b/i.test(s)) return true;
  if (/^\d{1,5}[A-Za-z]?\s*[-,]?\s*[A-Za-z0-9]/.test(s)) return true;
  if (/\b(Thunder\s*Bay|ON\s+P\d)/i.test(s) && s.length < 140) return true;
  return false;
}

function isJunkName(name) {
  const n = String(name || '').trim();
  if (n.length < 2) return true;
  if (/^(william rd|waterloo st|memorial ave|cumberland)/i.test(n)) return true;
  if (looksLikeAddress(n) && !/[A-Za-z]{5,}/.test(n.replace(/\d+/g, ''))) return true;
  return false;
}

export function parseEmployersFromPdfText(text, sourceUrl, nowIso = new Date().toISOString()) {
  let t = String(text || '').replace(/\r/g, '');
  t = t.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '\n');
  t = t.replace(/Thunder Bay CMA RCIP Designated Employer\s*List-?/gi, '\n');
  t = t.replace(/AS OF[^\n]*/gi, '\n');
  t = t.replace(/This list of Designated Employers[\s\S]*?latest updates\./gi, '\n');
  t = t.replace(/Please note that businesses listed in red[\s\S]*?not hiring\./gi, '\n');

  const lines = t
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());

  const rawRows = [];
  let pending = '';

  const flush = (name, loc) => {
    name = String(name || '')
      .replace(/\s+/g, ' ')
      .trim();
    loc = String(loc || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name || isJunkName(name)) return;
    if (/^(please note|this list|updated|as of)/i.test(name)) return;
    rawRows.push({ name, loc });
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.includes('\t')) {
      const [left, ...rest] = line.split('\t');
      const right = rest.join(' ').trim();
      if (pending) {
        flush(`${pending} ${left}`, right);
        pending = '';
      } else flush(left, right);
      continue;
    }

    const inline = line.match(/^(.+?)\s+(\d{1,5}[A-Za-z]?(?:\s|-)(?:.+))$/);
    if (
      inline &&
      !looksLikeAddress(inline[1]) &&
      inline[1].length > 2 &&
      inline[1].length < 90 &&
      /[A-Za-z]/.test(inline[1])
    ) {
      if (pending) {
        flush(pending, '');
        pending = '';
      }
      flush(inline[1], inline[2]);
      continue;
    }

    if (pending) {
      if (looksLikeAddress(line)) {
        flush(pending, line);
        pending = '';
      } else {
        pending = `${pending} ${line}`;
      }
      continue;
    }

    const prev = rawRows[rawRows.length - 1];
    if (
      prev &&
      (looksLikeAddress(line) ||
        /^(william|waterloo|memorial|cumberland|oliver|arthur|fort)\b/i.test(line))
    ) {
      prev.loc = `${prev.loc} ${line}`.replace(/\s+/g, ' ').trim();
      continue;
    }

    pending = line;
  }
  if (pending) flush(pending, '');

  const listDateMatch = String(text).match(/AS OF\s+([A-Za-z]+\s+\d{1,2}\s+\d{4})/i);
  const listUpdated = listDateMatch ? listDateMatch[1] : '';

  const seen = new Set();
  const out = [];
  for (const row of rawRows) {
    const key = row.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    // Allow same legal brand at different addresses
    const locKey = (row.loc || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40);
    const idKey = `${key}|${locKey}`;
    if (!key || seen.has(idKey)) continue;
    seen.add(idKey);

    const recordSuffix = locKey ? `${normalizeIdPart(row.name)}-${locKey.slice(0, 24)}` : normalizeIdPart(row.name);

    out.push({
      record_id: `${COMMUNITY_ID}|${recordSuffix}`.slice(0, 120),
      community_id: COMMUNITY_ID,
      employer_name: row.name,
      locations: row.loc || 'Thunder Bay CMA, ON',
      sector: '',
      recruiting_status: 'unknown',
      source_url: sourceUrl || FALLBACK_PDF,
      source_type: 'pdf',
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      status: 'active',
      manual_override: 'FALSE',
      review_status: 'new',
      notes: [
        listUpdated ? `Source list updated: ${listUpdated}` : '',
        'Source PDF marks some employers in red as not hiring (colour not available in text extract).',
      ]
        .filter(Boolean)
        .join(' | '),
    });
  }
  return out;
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
  const pdfUrl = findEmployerListPdf(html);
  console.log(`Portal HTTP ${pageRes.status}: ${nocs.length} NOCs`);
  console.log(nocs.slice(0, 2));
  console.log('Employer PDF:', pdfUrl);

  const pdfRes = await fetch(pdfUrl, { headers: { 'User-Agent': UA } });
  const buf = Buffer.from(await pdfRes.arrayBuffer());
  const parser = new PDFParse({ data: buf });
  const { text } = await parser.getText();
  await parser.destroy?.();
  const employers = parseEmployersFromPdfText(text, pdfUrl);
  console.log(`Employers PDF HTTP ${pdfRes.status}: ${employers.length}`);
  console.log(employers.slice(0, 3));

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const seedDir = join(__dirname, '..', 'database', 'seeds');
  mkdirSync(seedDir, { recursive: true });
  writeFileSync(join(seedDir, 'thunder-bay-priority-nocs.csv'), rowsToCsv(nocs, NOC_HEADERS));
  writeFileSync(join(seedDir, 'thunder-bay-employers.csv'), rowsToCsv(employers, EMPLOYER_HEADERS));
  console.log('Wrote seeds to', seedDir);
}

const isDirect = process.argv[1] && process.argv[1].endsWith('parse-thunder-bay.mjs');
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
