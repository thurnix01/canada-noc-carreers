/**
 * Moose Jaw RCIP parsers (HTML priority NOC table + designated employers PDF).
 * Usage: node scripts/parse-moose-jaw.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFParse } from 'pdf-parse';

const COMMUNITY_ID = 'moose-jaw';
const YEAR = '2026';
const NOC_URL = 'https://rcip.mjchamber.com/employers/';
const CANDIDATES_URL = 'https://rcip.mjchamber.com/candidates/';
const FALLBACK_PDF =
  'https://rcip.mjchamber.com/wp-content/uploads/2026/08/designated-employer-list-AUG-26.pdf';
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
    if (url.startsWith('/')) url = 'https://rcip.mjchamber.com' + url;
    urls.push(url);
  }
  const designated = urls.filter((u) => /designated-employer-list/i.test(u));
  if (designated.length) {
    designated.sort();
    return designated.at(-1);
  }
  return FALLBACK_PDF;
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
    const noc = cells.find((c) => /^\d{5}$/.test(c)) || cells[0].match(/\d{5}/)?.[0];
    if (!noc || seen.has(noc)) continue;
    const titleIdx = cells.findIndex((c) => c !== noc && c.length > 2 && !/view wages|\$/i.test(c));
    const title = titleIdx >= 0 ? cells[titleIdx] : cells[1];
    if (!title || /occupation code|occupation name/i.test(title)) continue;
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

function isIntroLine(line) {
  return (
    /^(individuals|accepting|that match|applicants first|businessess|please do not|most designated|the best way|actively advertised)/i.test(
      line,
    ) ||
    (/\b(the|and|are|not|for|with|your|them|have)\b/i.test(line) &&
      !/\b(Inc|Ltd|LLC|College|Hotel|Clinic|Pizza|Restaurant|Inn|Motors|Canada|Construction|Centre|Center|Division|Company|Co-op|Services|Group|Foods|Express|Limited|Corporation|ULC|GP|YMCA|Dental|Medical|Health|Care|Living|Place|Park|Market|Bank|Spa|School|Energy|Auto|Tire|Farm|Transport|Insurance|Accountants|Communications|Professional|Village|Apartments|Motel|Brew|Burger|Chicken|Donair|Pharmacy|Grocery|Meats|Roof|Cleaners|Distillery|Rail|Truck|Trailer|Repair|Academy|Chamber|College|Weld|Spa|Box|Leaf|Chok|Chaplin|Carpet|Cash|Cell|Church|Civic|Comfort|Coral|Crescent|Delight|Edo|End|Evolve|Family|Flying|Fountain|Grant|Hertz|Holiday|Hopkin|Houston|Hub|Jade|John|Karis|KFC|Lakeview|Little|McDonald|MNP|Montana|Moose|Mr\.|Murray|North|Panda|Philthy|Pilgrim|Pomme|Potter|Prairie|Providence|Quality|Ramada|Red|Rodo|Royal|Sahara|Seaborn|Seeds|Smitty|Smooth|Soni|Subway|Super8|Taco|Telefi|Temple|Thunder|TJ|Travelodge|Town|TrailTech|Trifon|Tunnel|Unique|Wendy|West|Western|WinMar|Wok|Wrapture|Xpert|YMCA)\b/i.test(
        line,
      ))
  );
}

function isLikelyNameStart(line) {
  if (isIntroLine(line)) return false;
  if (/^--/.test(line)) return false;
  if (line.length < 3) return false;
  return /^[\dA-Z&]/.test(line);
}

function looksCompleteName(line) {
  return /\b(Inc|Ltd|LLC|ULC|Corporation|Limited|Group|Services|College|Hotel|Clinic|Pizza|Restaurant|Inn|Motors|Canada|Construction|Centre|Center|Division|Company|Co-op|Motel|Bank|Spa|School|Division|Express|Place|Park|Market|Foods|Academy|Chamber|Dental|Medical|Health|Care|Living|Village|Apartments|Distillery|Optical|Consulting|YMCA|Tire|Auto|Farm|Transport|Insurance|Accountants|Communications|Professional|Village|Roof|Cleaners|Meats|Grocery|Pharmacy|Brew|Burger|Chicken|Donair|Pharmacy|Lounge|Communications)\b\.?\s*$/i.test(
    line,
  );
}

function isContinuation(prev, next) {
  if (!prev || !next) return false;
  if (looksCompleteName(prev)) return false;
  if (/^(Inc|Ltd|LLC|ULC|GP|Division|College)\.?\s*$/i.test(next)) return true;
  if (/^[a-z]/.test(next)) return true;
  if (/\b(of|our|the|&|and)\s*$/i.test(prev.trim())) return true;
  if (/^Jaw$/i.test(next) && /Moose$/i.test(prev)) return true;
  if (/^(Lady|Citizen|All|Centre|Center|Foods|Maintenance|Audiology|Parlour|Roll|Villa|Residence|Kitchen|Bar|Shawarma|Dairies|Farms|Stairs|Employees|Orchard|Roofers|Manufacturing|Game On)$/i.test(next))
    return true;
  return false;
}

export function parseEmployersFromPdfText(text, sourceUrl, nowIso = new Date().toISOString()) {
  let t = String(text || '').replace(/\r/g, '');
  t = t.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '\n');
  t = t.replace(/\*\* Important Notice[\s\S]*?designation later\./gi, '\n');
  t = t.replace(/Current Designated Employers/gi, '\n');

  const lines = t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const startIdx = lines.findIndex((l) => isLikelyNameStart(l) && !isIntroLine(l));
  const dataLines = startIdx >= 0 ? lines.slice(startIdx) : lines;

  const joined = [];
  let pending = '';
  for (const line of dataLines) {
    if (isIntroLine(line)) continue;
    if (!pending) {
      pending = line;
      continue;
    }
    if (isContinuation(pending, line)) {
      pending = `${pending} ${line}`.replace(/\s+/g, ' ').trim();
    } else {
      joined.push(pending);
      pending = line;
    }
  }
  if (pending) joined.push(pending);

  const seen = new Set();
  const out = [];
  for (let name of joined) {
    name = name.replace(/\s+/g, ' ').trim();
    if (!name || name.length < 3) continue;
    if (/^important notice|^current designated/i.test(name)) continue;
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);

    out.push({
      record_id: `${COMMUNITY_ID}|${normalizeIdPart(name)}`,
      community_id: COMMUNITY_ID,
      employer_name: name,
      locations: 'Moose Jaw, SK',
      sector: '',
      recruiting_status: 'unknown',
      source_url: sourceUrl || FALLBACK_PDF,
      source_type: 'pdf',
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      status: 'active',
      manual_override: 'FALSE',
      review_status: 'new',
      notes: 'Multi-column PDF; some names may be merged or split incorrectly.',
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
  const nocRes = await fetch(NOC_URL, opts);
  const nocs = parsePriorityNocs(await nocRes.text());

  const candRes = await fetch(CANDIDATES_URL, opts);
  const pdfUrl = findEmployerListPdf(await candRes.text());
  console.log('Employer PDF:', pdfUrl);

  const pdfRes = await fetch(pdfUrl, { headers: { 'User-Agent': UA } });
  const buf = Buffer.from(await pdfRes.arrayBuffer());
  const parser = new PDFParse({ data: buf });
  const { text } = await parser.getText();
  await parser.destroy?.();
  const employers = parseEmployersFromPdfText(text, pdfUrl);

  console.log(`NOC HTTP ${nocRes.status}: ${nocs.length} NOCs`);
  console.log(`Employers PDF HTTP ${pdfRes.status}: ${employers.length} employers`);

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const seedDir = join(__dirname, '..', 'database', 'seeds');
  mkdirSync(seedDir, { recursive: true });
  writeFileSync(join(seedDir, `${COMMUNITY_ID}-priority-nocs.csv`), rowsToCsv(nocs, NOC_HEADERS));
  writeFileSync(join(seedDir, `${COMMUNITY_ID}-employers.csv`), rowsToCsv(employers, EMPLOYER_HEADERS));
  console.log('Wrote seeds to', seedDir);
}

const isDirect = process.argv[1] && process.argv[1].endsWith('parse-moose-jaw.mjs');
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
