/**
 * Steinbach RCIP parsers (HTML priority NOCs + designated employers PDF).
 * Usage: node scripts/parse-steinbach.mjs
 * Writes database/seeds/steinbach-*.csv for export merge / Sheet import.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFParse } from 'pdf-parse';

const COMMUNITY_ID = 'steinbach';
const YEAR = '2026';
const PORTAL_URL = 'https://steinbachedc.com/rcip/';
const FALLBACK_PDF =
  'https://steinbachedc.com/wp-content/uploads/2026/09/RCIP-Designated-Employers-1.pdf';
const UA = 'RCIPAggregatorBot/0.1 (+mailto:absolondesigns@gmail.com)';

const DEFAULT_CAP =
  'Max 1 recommendation per NOC per month, max 2 recommendations per calendar year per NOC (unless noted).';

const NOC_SECTOR_BY_PREFIX = {
  1: 'Business, finance and administration',
  2: 'Natural and applied sciences',
  3: 'Health',
  4: 'Education, law and social, community and government services',
  6: 'Sales and service',
  7: 'Trades and transport',
  8: 'Natural resources and agriculture',
  9: 'Manufacturing and utilities',
};

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, "'")
    .replace(/&#038;/g, '&')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&[a-z]+;/gi, ' ');
}

function stripTags(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
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
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return lines.join('\n') + '\n';
}

/** Prefer RCIP-Designated-Employers PDF linked near “List of Designated Employers”. */
export function findEmployerListPdf(html) {
  const urls = [];
  const hrefRe = /href="(https?:\/\/[^"]+\.pdf[^"]*|\/[^"]+\.pdf[^"]*)"/gi;
  let m;
  while ((m = hrefRe.exec(html))) {
    let url = m[1];
    if (url.startsWith('/')) url = 'https://steinbachedc.com' + url;
    urls.push(url);
  }
  const designated = urls.filter((u) => /designated.?employer/i.test(u) || /RCIP-Designated/i.test(u));
  if (designated.length) {
    designated.sort();
    return designated.at(-1);
  }
  const any = urls.filter((u) => /steinbach/i.test(u) && /employer/i.test(u));
  if (any.length) {
    any.sort();
    return any.at(-1);
  }
  return FALLBACK_PDF;
}

function parseRestrictionNotes(html) {
  const byNoc = new Map();

  const setNote = (noc, note) => {
    const prev = byNoc.get(noc) || '';
    if (!prev || note.length > prev.length) byNoc.set(noc, note);
  };

  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRe.exec(html))) {
    const text = stripTags(m[1]);
    if (!/\d{5}/.test(text)) continue;

    const notAvail = text.match(/(\d{5})\s*[–—-].*?[–—-]\s*not available/i);
    if (notAvail) {
      setNote(notAvail[1], 'Not available');
      continue;
    }

    const noLimit = text.match(/(\d{5}(?:,\s*\d{5})*)\s+whereby,?\s*no limitations apply/i);
    if (noLimit) {
      for (const noc of noLimit[1].match(/\d{5}/g) || []) {
        setNote(noc, 'No recommendation limitations apply');
      }
      continue;
    }

    const ece = text.match(
      /(\d{5})\s*[–—-]\s*Early Childhood Educator[^–—-]*[–—-]\s*(.+)$/i,
    );
    if (ece) {
      setNote(ece[1], ece[2].replace(/\s+/g, ' ').trim());
      continue;
    }

    const food = text.match(/(\d{5})\s*[–—-]\s*Food Service Supervisors\s*[–—-]\s*(.+)$/i);
    if (food) {
      setNote(food[1], food[2].replace(/\s+/g, ' ').trim());
    }
  }
  return byNoc;
}

export function parsePriorityNocs(html, nowIso = new Date().toISOString()) {
  const restrictions = parseRestrictionNotes(html);
  const out = [];
  const seen = new Set();

  // Mobile + desktop tabs duplicate the same <p>NOC – Title</p> lines
  const re = /<p>\s*(\d{5})\s*(?:&#8211;|[–—-])\s*([^<]+)<\/p>/gi;
  let m;
  while ((m = re.exec(html))) {
    const noc = m[1];
    if (seen.has(noc)) continue;
    seen.add(noc);
    const title = decodeEntities(m[2]).replace(/\s+/g, ' ').trim();
    const prefix = noc[0];
    const special = restrictions.get(noc) || '';
    const notes = [special || DEFAULT_CAP].filter(Boolean).join(' | ');

    out.push({
      record_id: `${COMMUNITY_ID}|${noc}|${YEAR}`,
      community_id: COMMUNITY_ID,
      noc_code: noc,
      noc_title: title,
      sector: NOC_SECTOR_BY_PREFIX[prefix] || '',
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

  out.sort((a, b) => a.noc_code.localeCompare(b.noc_code));
  return out;
}

export function parseEmployersFromPdfText(text, sourceUrl, nowIso = new Date().toISOString()) {
  let t = String(text || '').replace(/\r/g, '');
  t = t.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '\n');
  t = t.replace(/List of Designated Employers:\s*/gi, '\n');
  t = t.replace(/D4-284 Reimer Ave[^\n]*/gi, '\n');
  t = t.replace(/www\.SteinbachEDC\.com/gi, '\n');
  t = t.replace(/Office@SteinbachEDC\.com/gi, '\n');

  const lines = t
    .split('\n')
    .map((l) => l.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const seen = new Set();
  const out = [];
  for (const line of lines) {
    if (/^\d{3}[.\s]?\d{3}[.\s]?\d{4}$/.test(line)) continue;
    if (/reimer|steinbachedc|designated employer|list of/i.test(line)) continue;
    if (line.length < 2 || line.length > 120) continue;

    const key = line.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);

    out.push({
      record_id: `${COMMUNITY_ID}|${normalizeIdPart(line)}`,
      community_id: COMMUNITY_ID,
      employer_name: line,
      locations: 'Steinbach, MB',
      sector: '',
      recruiting_status: 'unknown',
      source_url: sourceUrl || FALLBACK_PDF,
      source_type: 'pdf',
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      status: 'active',
      manual_override: 'FALSE',
      review_status: 'new',
      notes: '',
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
    } else {
      upserts.push(row);
    }
  }
  const stale = [];
  for (const [id, prev] of existingById) {
    if (scrapedIds.has(id)) continue;
    if (String(prev.manual_override).toUpperCase() === 'TRUE') continue;
    if ((prev.community_id || '') !== communityId) continue;
    if (prev.status === 'stale' || prev.status === 'removed') continue;
    stale.push({
      ...prev,
      status: 'stale',
      last_seen_at: nowIso,
      review_status: 'needs_review',
    });
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
  const nocPath = join(seedDir, 'steinbach-priority-nocs.csv');
  const empPath = join(seedDir, 'steinbach-employers.csv');
  writeFileSync(nocPath, rowsToCsv(nocs, NOC_HEADERS));
  writeFileSync(empPath, rowsToCsv(employers, EMPLOYER_HEADERS));
  console.log('Wrote', nocPath);
  console.log('Wrote', empPath);
}

const isDirect = process.argv[1] && process.argv[1].endsWith('parse-steinbach.mjs');
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
