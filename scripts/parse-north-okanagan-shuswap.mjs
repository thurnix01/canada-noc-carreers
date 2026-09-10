/**
 * North Okanagan–Shuswap RCIP parsers (HTML NOCs + employer PDF text).
 * Usage: node scripts/parse-north-okanagan-shuswap.mjs
 */
import { PDFParse } from 'pdf-parse';

const COMMUNITY_ID = 'north-okanagan-shuswap';
const YEAR = '2026';
const PRIORITIES_URL = 'https://rcipnorthokanaganshuswap.com/priority-sectors-nocs/';
const RESOURCES_URL = 'https://rcipnorthokanaganshuswap.com/resources-and-policies/';
const UA = 'RCIPAggregatorBot/0.1 (+mailto:absolondesigns@gmail.com)';

const SECTORS = [
  'Business, Finance and Administration',
  'Education, Law and Social, Community and Government Services',
  'Health',
  'Sales and Services',
  'Trades and Transport',
  'Natural Resources and Agriculture',
  'Manufacturing and Utilities',
];

function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8211;/g, '–')
    .replace(/&#038;/g, '&')
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

function extractTables(html) {
  const tables = [];
  const re = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let m;
  while ((m = re.exec(html))) tables.push(m[1]);
  return tables;
}

function tableRows(tableHtml) {
  const rows = [];
  const re = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = re.exec(tableHtml))) {
    const cells = [];
    const cre = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let c;
    while ((c = cre.exec(m[1]))) cells.push(stripTags(c[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

export function findLatestEmployerListPdf(html) {
  const urls = new Set();
  const hrefRe = /href="(https?:\/\/[^"]+\.pdf[^"]*|\/[^"]+\.pdf[^"]*)"/gi;
  let m;
  while ((m = hrefRe.exec(html))) {
    let url = m[1];
    if (url.startsWith('/')) url = 'https://rcipnorthokanaganshuswap.com' + url;
    if (/designated-employer-list/i.test(url)) urls.add(url);
  }
  const withText = /href="([^"]+\.pdf[^"]*)"[^>]*>([^<]*Designated Employer List[^<]*)</gi;
  while ((m = withText.exec(html))) {
    let url = m[1];
    if (url.startsWith('/')) url = 'https://rcipnorthokanaganshuswap.com' + url;
    urls.add(url);
  }
  const list = [...urls].sort();
  return list.at(-1) || '';
}

export function parsePriorityNocs(html, nowIso = new Date().toISOString()) {
  const tables = extractTables(html);
  const restrictionByNoc = new Map();
  // Table 3 (0-based) often holds restrictions
  if (tables[3]) {
    for (const cells of tableRows(tables[3])) {
      const blob = cells.join(' ');
      const nocMatch = blob.match(/(\d{5})\s*[–—-]/);
      if (!nocMatch) continue;
      const notes = (cells[2] || cells.slice(2).join(' ') || '').trim();
      if (notes) restrictionByNoc.set(nocMatch[1], notes);
    }
  }

  const out = [];
  // Priority NOC table is usually table index 1
  const nocTable = tables[1] || tables.find((t) => /\d{5}\s*[–—-]/.test(t));
  if (!nocTable) return out;

  for (const cells of tableRows(nocTable)) {
    const blob = cells.join(' | ');
    const nocMatch = blob.match(/\b(\d{5})\s*[–—-]\s*([^|]+)/);
    if (!nocMatch) continue;
    const noc = nocMatch[1];
    let title = nocMatch[2].trim();
    // Prefer dedicated title cell if present
    for (const cell of cells) {
      const cm = cell.match(/^(\d{5})\s*[–—-]\s*(.+)$/);
      if (cm) {
        title = cm[2].trim();
        break;
      }
    }
    const cap = cells.find((c) => /per year|N\/A/i.test(c)) || '';
    const notes = [restrictionByNoc.get(noc) || '', cap && cap !== 'N/A' ? `Employer cap: ${cap}` : '']
      .filter(Boolean)
      .join(' | ');

    out.push({
      record_id: `${COMMUNITY_ID}|${noc}|${YEAR}`,
      community_id: COMMUNITY_ID,
      noc_code: noc,
      noc_title: title,
      sector: '',
      year: YEAR,
      is_secondary: 'FALSE',
      restriction_notes: notes,
      source_url: PRIORITIES_URL,
      source_type: 'html',
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      status: 'active',
      manual_override: 'FALSE',
      review_status: 'new',
    });
  }

  // Dedupe
  const seen = new Set();
  return out.filter((r) => {
    if (seen.has(r.record_id)) return false;
    seen.add(r.record_id);
    return true;
  });
}

export function parseEmployersFromPdfText(text, sourceUrl, nowIso = new Date().toISOString()) {
  let t = String(text || '').replace(/\r/g, '');
  t = t.replace(
    /Education, Law and Social, Community\s*\n\s*and Government Services/g,
    'Education, Law and Social, Community and Government Services',
  );
  t = t.replace(/RCIP NOS\s+Designated Employer List\s+[^\n]+/g, '\n');
  t = t.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '\n');
  t = t.replace(/Designated Employer List\n?/g, '\n');
  t = t.replace(/North Okanagan-Shuswap Rural Community Immigration Pilot \(RCIP\)/g, '\n');
  t = t.replace(/Priority Sector\s+Business Legal Name/g, '\n');
  t = t.replace(/The following employers[\s\S]*?posted publicly by the employers\./g, '\n');
  t = t.replace(/Please note, the employers with an asterisk[\s\S]*$/i, '\n');

  const listDateMatch = String(text).match(/as of\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
  const listUpdated = listDateMatch ? listDateMatch[1] : '';

  const lines = t
    .split('\n')
    .map((l) => l.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const raw = [];
  let sector = '';
  for (const line of lines) {
    const matched = SECTORS.find((s) => line === s || line.startsWith(s + ' '));
    if (matched) {
      sector = matched;
      const rest = line.slice(matched.length).trim();
      if (rest) raw.push({ sector, name: rest });
      continue;
    }
    if (/^(Unsolicited|Candidates should|This list|published here|could result|as of )/i.test(line)) continue;
    if (!sector) continue;
    raw.push({ sector, name: line });
  }

  const merged = [];
  for (const row of raw) {
    const prev = merged[merged.length - 1];
    const isCont =
      prev &&
      (/^(Ltd\.?|Inc\.?|Corp\.?|Limited|Society|Association|LLP|LLC)\.?$/i.test(row.name) ||
        (/^[a-z]/.test(row.name) && row.name.length < 40));
    if (isCont) {
      prev.name = `${prev.name} ${row.name}`.replace(/\s+/g, ' ').trim();
      continue;
    }
    merged.push({ ...row });
  }

  const seen = new Set();
  const out = [];
  for (const row of merged) {
    const key = row.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!key || seen.has(key)) continue;
    if (/asterisk|subsectors until|no longer accepting/i.test(row.name)) continue;
    seen.add(key);
    const starred = /\*$/.test(row.name.trim());
    out.push({
      record_id: `${COMMUNITY_ID}|${normalizeIdPart(row.name)}`,
      community_id: COMMUNITY_ID,
      employer_name: row.name.replace(/\*+$/, '').trim(),
      locations: '',
      sector: row.sector,
      recruiting_status: 'unknown',
      source_url: sourceUrl || RESOURCES_URL,
      source_type: 'pdf',
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      status: 'active',
      manual_override: 'FALSE',
      review_status: 'new',
      notes: [
        listUpdated ? `Source list updated: ${listUpdated}` : '',
        starred ? 'Marked * on source list (fast food / gas station note may apply)' : '',
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

async function main() {
  const opts = { headers: { 'User-Agent': UA, Accept: 'text/html' } };
  const [pRes, rRes] = await Promise.all([fetch(PRIORITIES_URL, opts), fetch(RESOURCES_URL, opts)]);
  const pHtml = await pRes.text();
  const rHtml = await rRes.text();
  const nocs = parsePriorityNocs(pHtml);
  const pdfUrl = findLatestEmployerListPdf(rHtml);
  console.log(`NOCs HTTP ${pRes.status}: ${nocs.length}`);
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
}

const isDirect = process.argv[1] && process.argv[1].endsWith('parse-north-okanagan-shuswap.mjs');
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
