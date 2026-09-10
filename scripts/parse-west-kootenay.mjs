/**
 * West Kootenay RCIP HTML parsers (shared logic for local tests + n8n Code nodes).
 * Usage: node scripts/parse-west-kootenay.mjs
 */
const COMMUNITY_ID = 'west-kootenay';
const YEAR = '2026';
const PRIORITIES_URL = 'https://westkootenayimmigration.ca/priorities/';
const EMPLOYERS_URL = 'https://westkootenayimmigration.ca/designated-employers/';

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

export function parsePriorityNocs(html, nowIso = new Date().toISOString()) {
  const tables = extractTables(html);
  const out = [];
  for (const table of tables) {
    const rows = tableRows(table);
    for (const cells of rows) {
      if (cells.length < 2) continue;
      const noc = (cells[1] || '').trim();
      if (!/^\d{5}$/.test(noc)) continue;
      const title = (cells[0] || '').replace(/\s*\(new\)\s*/gi, ' ').trim();
      const notes = (cells[5] || '').trim();
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
        _kind: 'priority_noc',
      });
    }
  }
  return out;
}

export function parseEmployers(html, nowIso = new Date().toISOString()) {
  const sectorHints = [
    'Business, Administration & Finance',
    'Health Sector',
    'Education, Law, Social, Community & Government Services',
    'Sales & Service',
    'Trades, Transport, & Equipment Operators',
    'Manufacturing & Utilities',
    'De-designated Employers',
  ];

  const parts = html.split(/(?=<table)/i);
  const out = [];
  let listUpdated = '';
  const updatedMatch = html.match(/Last updated:\s*([^<]+)/i);
  if (updatedMatch) listUpdated = stripTags(updatedMatch[1]);

  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    // Sector heading sits just before each <table> (end of previous chunk).
    const pre = stripTags(parts[i - 1] || '');
    let sector = '';
    let lastIdx = -1;
    for (const hint of sectorHints) {
      const idx = pre.lastIndexOf(hint);
      if (idx > lastIdx) {
        lastIdx = idx;
        sector = hint;
      }
    }
    const isDeDesignated = /de-designated/i.test(sector);
    const tableMatch = chunk.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
    if (!tableMatch) continue;
    const rows = tableRows(tableMatch[1]);
    for (const cells of rows) {
      for (const cell of cells) {
        const name = cell.trim();
        if (!name || /^employer name$/i.test(name)) continue;
        if (name.length < 2) continue;
        // Split "Name, Location" when possible — keep full string as employer_name
        let locations = '';
        const comma = name.indexOf(',');
        let employerName = name;
        if (comma > 0 && comma < name.length - 1) {
          // Many rows are "Business Ltd, Town" — keep full name for display; locations = after first comma group of towns
          locations = name.slice(comma + 1).trim();
          // Prefer keeping full published string as employer_name for matching community list
          employerName = name;
        }
        const recruiting = isDeDesignated ? 'de_designated' : 'unknown';
        const status = isDeDesignated ? 'removed' : 'active';
        out.push({
          record_id: `${COMMUNITY_ID}|${normalizeIdPart(employerName)}`,
          community_id: COMMUNITY_ID,
          employer_name: employerName,
          locations,
          sector: isDeDesignated ? 'De-designated' : sector,
          recruiting_status: recruiting,
          source_url: EMPLOYERS_URL,
          source_type: 'html',
          first_seen_at: nowIso,
          last_seen_at: nowIso,
          status,
          manual_override: 'FALSE',
          review_status: 'new',
          notes: listUpdated ? `Source list updated: ${listUpdated}` : '',
          _kind: 'employer',
        });
      }
    }
  }

  // Dedupe by record_id (first wins)
  const seen = new Set();
  return out.filter((r) => {
    if (seen.has(r.record_id)) return false;
    seen.add(r.record_id);
    return true;
  });
}

export function mergeUpserts(scraped, existingRows, idField = 'record_id') {
  const existingById = new Map();
  for (const row of existingRows) {
    const id = (row[idField] || '').toString();
    if (id) existingById.set(id, row);
  }

  const scrapedIds = new Set(scraped.map((r) => r[idField]));
  const nowIso = new Date().toISOString();
  const upserts = [];

  for (const row of scraped) {
    const prev = existingById.get(row[idField]);
    if (prev && String(prev.manual_override).toUpperCase() === 'TRUE') {
      continue; // never overwrite manual rows
    }
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
    if ((prev.community_id || '') !== COMMUNITY_ID) continue;
    if ((prev.status || '') === 'stale' || (prev.status || '') === 'removed') continue;
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
  const ua = 'RCIPAggregatorBot/0.1 (+mailto:absolondesigns@gmail.com)';
  const opts = { headers: { 'User-Agent': ua, Accept: 'text/html' } };

  const [pRes, eRes] = await Promise.all([
    fetch(PRIORITIES_URL, opts),
    fetch(EMPLOYERS_URL, opts),
  ]);
  const pHtml = await pRes.text();
  const eHtml = await eRes.text();
  const nocs = parsePriorityNocs(pHtml);
  const employers = parseEmployers(eHtml);

  console.log(`Priorities HTTP ${pRes.status}: ${nocs.length} NOCs`);
  console.log(nocs.slice(0, 3));
  console.log(`Employers HTTP ${eRes.status}: ${employers.length} employers`);
  console.log(employers.slice(0, 3));
  console.log('Sectors:', [...new Set(employers.map((e) => e.sector))]);
}

const isDirect = process.argv[1] && process.argv[1].endsWith('parse-west-kootenay.mjs');
if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
