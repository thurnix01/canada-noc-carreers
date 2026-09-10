/**
 * Timmins Regional RCIP parsers (HTML priority NOCs + designated employers PDF).
 * Usage: node scripts/parse-timmins.mjs
 * Writes database/seeds/timmins-*.csv for export merge / Sheet import.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFParse } from 'pdf-parse';

const COMMUNITY_ID = 'timmins';
const YEAR = '2026';
const PORTAL_URL = 'https://timminsedc.com/immigration/';
const FALLBACK_PDF =
  'https://timminsedc.com/wp-content/uploads/2026/07/Designated-Employer-List-Timmins-Regional-RCIP-FCIP.pdf';
const UA = 'RCIPAggregatorBot/0.1 (+mailto:absolondesigns@gmail.com)';

const SECTORS = [
  'Health',
  'Education and Social, Community and Government Services',
  'Trades and Transport',
  'Natural Resources and Agriculture',
  'Business, Finance and Administration',
  'Manufacturing and Utilities',
];

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
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return lines.join('\n') + '\n';
}

export function findEmployerListPdf(html) {
  const urls = [];
  const hrefRe = /href="(https?:\/\/[^"]+\.pdf[^"]*|\/[^"]+\.pdf[^"]*)"/gi;
  let m;
  while ((m = hrefRe.exec(html))) {
    let url = m[1];
    if (url.startsWith('/')) url = 'https://timminsedc.com' + url;
    urls.push(url);
  }
  const designated = urls.filter((u) => /designated-employer/i.test(u));
  if (designated.length) {
    designated.sort();
    return designated.at(-1);
  }
  return FALLBACK_PDF;
}

function extractTabContent(html, tabId) {
  const re = new RegExp(`id="${tabId}"[^>]*>([\\s\\S]*?)</div>`, 'i');
  const m = html.match(re);
  return m ? m[1] : '';
}

function parseNocListItems(tabHtml, pilot, nowIso) {
  const out = [];
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRe.exec(tabHtml))) {
    const text = stripTags(m[1]);
    const nocMatch = text.match(/^(\d{5})\s+(.+)$/);
    if (!nocMatch) continue;
    const noc = nocMatch[1];
    let rest = nocMatch[2].trim();
    const starred = /\*$/.test(rest) || /\*/.test(rest);
    rest = rest.replace(/\*+$/, '').trim();

    let title = rest;
    let notes = [];
    const dash = rest.match(/^(.+?)\s*[–—-]\s*(.+)$/);
    if (dash && /required|degree|diploma|apply/i.test(dash[2])) {
      title = dash[1].trim();
      notes.push(dash[2].trim());
    }
    if (starred) notes.push('Marked * on source list');
    notes.push(pilot === 'RCIP' ? 'RCIP priority occupation' : 'FCIP priority occupation');

    out.push({
      record_id: `${COMMUNITY_ID}|${noc}|${YEAR}`,
      community_id: COMMUNITY_ID,
      noc_code: noc,
      noc_title: title,
      sector: '',
      year: YEAR,
      is_secondary: pilot === 'FCIP' ? 'TRUE' : 'FALSE',
      restriction_notes: notes.join(' | '),
      source_url: PORTAL_URL,
      source_type: 'html',
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      status: 'active',
      manual_override: 'FALSE',
      review_status: 'new',
      _pilot: pilot,
    });
  }
  return out;
}

export function parsePriorityNocs(html, nowIso = new Date().toISOString()) {
  // Elementor tabs: 2881 = RCIP, 2882 = FCIP (ids may change — fall back to first two occupation tabs)
  let rcipHtml = extractTabContent(html, 'elementor-tab-content-2881');
  let fcipHtml = extractTabContent(html, 'elementor-tab-content-2882');
  if (!rcipHtml || !/\d{5}/.test(rcipHtml)) {
    const tabs = [...html.matchAll(/id="(elementor-tab-content-\d+)"[^>]*>([\s\S]*?)<\/div>/gi)];
    const withNocs = tabs.filter((t) => /\d{5}/.test(t[2]));
    rcipHtml = withNocs[0]?.[2] || '';
    fcipHtml = withNocs[1]?.[2] || '';
  }

  const byNoc = new Map();
  for (const row of parseNocListItems(rcipHtml, 'RCIP', nowIso)) {
    byNoc.set(row.noc_code, row);
  }
  for (const row of parseNocListItems(fcipHtml, 'FCIP', nowIso)) {
    const prev = byNoc.get(row.noc_code);
    if (prev) {
      if (!/FCIP/i.test(prev.restriction_notes)) {
        prev.restriction_notes = `${prev.restriction_notes} | Also on FCIP list`;
      }
      continue;
    }
    byNoc.set(row.noc_code, row);
  }

  return [...byNoc.values()]
    .map(({ _pilot, ...row }) => row)
    .sort((a, b) => a.noc_code.localeCompare(b.noc_code));
}

function normalizePdfText(text) {
  let t = String(text || '').replace(/\r/g, '');
  t = t.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '\n');
  t = t.replace(/List of Designated Employers\n?/gi, '\n');
  t = t.replace(
    /Timmins Regional Rural and Francophone Community Immigration Pilots \(RCIP-FCIP\)/gi,
    '\n',
  );
  t = t.replace(/The following employers are designated[\s\S]*?surrounding region\./gi, '\n');
  t = t.replace(/Priority Sector\s+Employer.?s Legal Business Name\s+Pilot Designated\s+Under/gi, '\n');
  t = t.replace(/Updated as of[^\n]*/gi, '\n');
  // Rejoin wrapped sector titles
  t = t.replace(
    /Education and\s*\n\s*Social,\s*\n\s*Community and\s*\n\s*Government\s*\n\s*Services/gi,
    'Education and Social, Community and Government Services',
  );
  t = t.replace(
    /Natural\s*\n\s*Resources and\s*\n\s*Agriculture/gi,
    'Natural Resources and Agriculture',
  );
  t = t.replace(
    /Business, Finance\s*\n\s*and\s*\n\s*Administration/gi,
    'Business, Finance and Administration',
  );
  t = t.replace(/Manufacturing\s*\n\s*and Utilities/gi, 'Manufacturing and Utilities');
  t = t.replace(/Trades and\s*\n\s*Transport/gi, 'Trades and Transport');
  return t;
}

function isPilotLine(line) {
  return /^(RCIP|FCIP|RCIP\/FCIP)$/i.test(line.trim());
}

function isSectorLine(line) {
  return SECTORS.some((s) => line === s || line.startsWith(s + ' '));
}

function mergeNameContinuations(names) {
  const merged = [];
  for (const name of names) {
    const prev = merged[merged.length - 1];
    const isCont =
      prev &&
      (/^(Residence|Inc\.?|Ltd\.?|Limited|Corporation|Services|Centre|Center)$/i.test(name) ||
        (/^[a-z]/.test(name) && name.length < 40) ||
        (prev.length > 40 && !/\)$/.test(prev) && name.length < 30 && !/Inc|Ltd|Hospital|Centre/i.test(name.slice(0, 12))));
    // Known wrap: "...Teck Pioneer" + "Residence"
    if (prev && /Pioneer$/i.test(prev) && /^Residence$/i.test(name)) {
      merged[merged.length - 1] = `${prev} ${name}`;
      continue;
    }
    if (isCont) {
      merged[merged.length - 1] = `${prev} ${name}`.replace(/\s+/g, ' ').trim();
      continue;
    }
    merged.push(name);
  }
  return merged;
}

export function parseEmployersFromPdfText(text, sourceUrl, nowIso = new Date().toISOString()) {
  const t = normalizePdfText(text);
  const lines = t
    .split('\n')
    .map((l) => l.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const entries = []; // {sector, name, pilot}
  let sector = '';
  let nameBuf = [];
  let pilotBuf = [];

  const flushPair = () => {
    const names = mergeNameContinuations(nameBuf);
    const pilots = pilotBuf.map((p) => p.trim().toUpperCase());
    for (let i = 0; i < names.length; i++) {
      const pilot = pilots[i] || (pilots.length === 1 ? pilots[0] : '');
      entries.push({ sector, name: names[i], pilot: pilot || 'unknown' });
    }
    nameBuf = [];
    pilotBuf = [];
  };

  for (const raw of lines) {
    let line = raw;

    // Sector may share first employer: "Health Anson General Hospital"
    const sectorHit = SECTORS.find((s) => line === s || line.startsWith(s + ' '));
    if (sectorHit) {
      if (nameBuf.length || pilotBuf.length) flushPair();
      sector = sectorHit;
      const rest = line.slice(sectorHit.length).trim();
      if (rest) {
        // May end with pilot on same line
        const same = rest.match(/^(.+?)\s+(RCIP(?:\/FCIP)?|FCIP)$/i);
        if (same) {
          nameBuf.push(same[1].trim());
          pilotBuf.push(same[2].trim().toUpperCase());
          flushPair();
        } else {
          nameBuf.push(rest);
        }
      }
      continue;
    }

    if (isPilotLine(line)) {
      pilotBuf.push(line);
      continue;
    }

    // Name line that ends with pilot tag
    const trailing = line.match(/^(.+?)\s+(RCIP(?:\/FCIP)?|FCIP)$/i);
    if (trailing && trailing[1].length > 2) {
      // If we were collecting pilots already, flush previous pair first
      if (pilotBuf.length && nameBuf.length) flushPair();
      nameBuf.push(trailing[1].trim());
      pilotBuf.push(trailing[2].trim().toUpperCase());
      flushPair();
      continue;
    }

    // Starting a new name run after pilots → flush previous
    if (pilotBuf.length && nameBuf.length === 0) {
      // orphans — drop
      pilotBuf = [];
    }
    if (pilotBuf.length && nameBuf.length) {
      flushPair();
    }
    nameBuf.push(line);
  }
  if (nameBuf.length) flushPair();

  const seen = new Set();
  const out = [];
  for (const row of entries) {
    if (!row.sector || !row.name) continue;
    if (/^priority sector/i.test(row.name)) continue;
    const notHiring = /\[not hiring\]/i.test(row.name);
    const employerName = row.name.replace(/\s*\[not hiring\]\s*/gi, '').trim();
    const key = employerName.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);

    out.push({
      record_id: `${COMMUNITY_ID}|${normalizeIdPart(employerName)}`,
      community_id: COMMUNITY_ID,
      employer_name: employerName,
      locations: 'Timmins region, ON',
      sector: row.sector,
      recruiting_status: notHiring ? 'not_hiring' : 'unknown',
      source_url: sourceUrl || FALLBACK_PDF,
      source_type: 'pdf',
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      status: 'active',
      manual_override: 'FALSE',
      review_status: 'new',
      notes: [
        row.pilot && row.pilot !== 'unknown' ? `Pilot: ${row.pilot}` : '',
        notHiring ? 'Listed as [not hiring] on source PDF' : '',
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
  console.log(
    'Pilots sample:',
    [...new Set(employers.map((e) => e.notes.match(/Pilot: ([^|]+)/)?.[1]).filter(Boolean))],
  );

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const seedDir = join(__dirname, '..', 'database', 'seeds');
  mkdirSync(seedDir, { recursive: true });
  writeFileSync(join(seedDir, 'timmins-priority-nocs.csv'), rowsToCsv(nocs, NOC_HEADERS));
  writeFileSync(join(seedDir, 'timmins-employers.csv'), rowsToCsv(employers, EMPLOYER_HEADERS));
  console.log('Wrote seeds to', seedDir);
}

const isDirect = process.argv[1] && process.argv[1].endsWith('parse-timmins.mjs');
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
