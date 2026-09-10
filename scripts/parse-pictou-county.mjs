/**
 * Pictou County RCIP parsers (HTML priority NOCs + designated employers PDF).
 * Usage: node scripts/parse-pictou-county.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFParse } from 'pdf-parse';

const COMMUNITY_ID = 'pictou-county';
const YEAR = '2026';
const PORTAL_URL = 'https://pcrcip.ca/';
const EMPLOYERS_PAGE = 'https://pcrcip.ca/employers/';
const FALLBACK_PDF =
  'https://pcrcip.ca/wp-content/uploads/PC_RCIP_Designated_Employers_July_2026.pdf';
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

export function findEmployerListPdf(html) {
  const urls = [];
  const hrefRe = /href="(https?:\/\/[^"]+\.pdf[^"]*|\/[^"]+\.pdf[^"]*)"/gi;
  let m;
  while ((m = hrefRe.exec(html))) {
    let url = m[1];
    if (url.startsWith('/')) url = 'https://pcrcip.ca' + url;
    urls.push(url);
  }
  const designated = urls.filter((u) => /PC_RCIP_Designated_Employers/i.test(u));
  if (designated.length) return designated[0];
  return FALLBACK_PDF;
}

export function parsePriorityNocs(html, nowIso = new Date().toISOString()) {
  const out = [];
  const seen = new Set();
  const text = stripTags(html);
  const lineRe = /(.+?)\s*[–—-]\s*(\d{5})\b/g;
  let m;
  while ((m = lineRe.exec(text))) {
    const noc = m[2];
    if (seen.has(noc)) continue;
    seen.add(noc);
    const title = m[1].trim();
    if (!title || /priority sector|occupation list|rcip 2026/i.test(title)) continue;

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

  // Also match dmach-acf-value paragraphs: Title – 12200
  const acfRe = /class="dmach-acf-value[^"]*"[^>]*>([^<]+–\s*\d{5}[^<]*)</gi;
  while ((m = acfRe.exec(html))) {
    const line = stripTags(m[1]);
    const mm = line.match(/^(.+?)\s*[–—-]\s*(\d{5})$/);
    if (!mm) continue;
    const noc = mm[2];
    if (seen.has(noc)) continue;
    seen.add(noc);
    out.push({
      record_id: `${COMMUNITY_ID}|${noc}|${YEAR}`,
      community_id: COMMUNITY_ID,
      noc_code: noc,
      noc_title: mm[1].trim(),
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

function recruitingStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (/^recruiting$/.test(s) || /\brecruiting\b/.test(s) && !/not/.test(s)) return 'hiring';
  if (/not currently recruiting|not recruiting/.test(s)) return 'not_hiring';
  return 'unknown';
}

export function parseEmployersFromPdfText(text, sourceUrl, nowIso = new Date().toISOString()) {
  let t = String(text || '').replace(/\r/g, '');
  t = t.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '\n');
  t = t.replace(/Pictou County RCIP Updated[^\n]*/gi, '\n');
  t = t.replace(/Pictou County Rural Community Immigration Pilot[^\n]*/gi, '\n');
  t = t.replace(/RCIP is employer-driven[\s\S]*?job advertisements\./gi, '\n');
  t = t.replace(/Note: Unsolicited requests[^\n]*/gi, '\n');
  t = t.replace(/Pictou County RCIP Designated Employers[^\n]*/gi, '\n');
  t = t.replace(/This list does not indicate[^\n]*/gi, '\n');
  t = t.replace(/Job seekers interested[^\n]*/gi, '\n');

  const lines = t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const seen = new Set();
  const out = [];
  for (const line of lines) {
    let name = line;
    let statusRaw = '';
    if (line.includes('\t')) {
      const parts = line.split('\t');
      name = parts[0].trim();
      statusRaw = parts.slice(1).join(' ').trim();
    } else {
      const inline = line.match(/^(.+?)\s{2,}(recruiting|not currently recruiting)/i);
      if (inline) {
        name = inline[1].trim();
        statusRaw = inline[2].trim();
      }
    }

    name = name.replace(/\s+/g, ' ').trim();
    if (!name || name.length < 3) continue;
    if (/^(status|employer name|designated employers)$/i.test(name)) continue;
    if (/^pictou county rcip designated employers/i.test(name)) continue;

    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);

    out.push({
      record_id: `${COMMUNITY_ID}|${normalizeIdPart(name)}`,
      community_id: COMMUNITY_ID,
      employer_name: name,
      locations: 'Pictou County, NS',
      sector: '',
      recruiting_status: recruitingStatus(statusRaw),
      source_url: sourceUrl || FALLBACK_PDF,
      source_type: 'pdf',
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
  const opts = { headers: { 'User-Agent': UA, Accept: 'text/html' } };
  const pageRes = await fetch(PORTAL_URL, opts);
  const html = await pageRes.text();
  const nocs = parsePriorityNocs(html);
  console.log(`Portal HTTP ${pageRes.status}: ${nocs.length} NOCs`);

  const empPageRes = await fetch(EMPLOYERS_PAGE, opts);
  const empHtml = await empPageRes.text();
  const pdfUrl = findEmployerListPdf(empHtml);
  console.log('Employer PDF:', pdfUrl);

  const pdfRes = await fetch(pdfUrl, { headers: { 'User-Agent': UA } });
  const buf = Buffer.from(await pdfRes.arrayBuffer());
  const parser = new PDFParse({ data: buf });
  const { text } = await parser.getText();
  await parser.destroy?.();
  const employers = parseEmployersFromPdfText(text, pdfUrl);
  console.log(`Employers PDF HTTP ${pdfRes.status}: ${employers.length}`);

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const seedDir = join(__dirname, '..', 'database', 'seeds');
  mkdirSync(seedDir, { recursive: true });
  writeFileSync(join(seedDir, `${COMMUNITY_ID}-priority-nocs.csv`), rowsToCsv(nocs, NOC_HEADERS));
  writeFileSync(join(seedDir, `${COMMUNITY_ID}-employers.csv`), rowsToCsv(employers, EMPLOYER_HEADERS));
  console.log('Wrote seeds to', seedDir);
}

const isDirect = process.argv[1] && process.argv[1].endsWith('parse-pictou-county.mjs');
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
