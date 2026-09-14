/**
 * Export Google Sheet tabs → web/public/data/listings.json
 * Community directory merges Sheet `database` + local data/communities.json
 * so all active RCIP regions appear even before Sheet rows are updated.
 *
 * Usage: node scripts/export-listings.mjs
 */
import { writeFileSync, mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1H3RDFGINQ-lBVaR_EOn1LDU4ezWf7q2bfY5XnUAFZpo';
const LOCAL_COMMUNITIES = join(__dirname, '..', 'data', 'communities.json');
const SEEDS_DIR = join(__dirname, '..', 'database', 'seeds');

function csvUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

/** Minimal CSV parser (handles quoted fields). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\r') {
      // skip
    } else {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = (r[idx] ?? '').trim();
      });
      return obj;
    });
}

async function fetchSheet(name) {
  const res = await fetch(csvUrl(name), {
    headers: { 'User-Agent': 'RCIPAggregatorBot/0.1 (+mailto:absolondesigns@gmail.com)' },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${name}: HTTP ${res.status}`);
  const text = await res.text();
  if (text.includes('<!DOCTYPE html>') || text.includes('Sign in')) {
    throw new Error(
      `Sheet "${name}" is not publicly readable as CSV. Share the spreadsheet: Anyone with the link → Viewer.`,
    );
  }
  return parseCsv(text);
}

/**
 * Merge local seed CSVs (from parsers) under Sheet rows.
 * Sheet wins on duplicate record_id so n8n remains source of truth once imported.
 */
function loadSeedRows(suffix) {
  if (!existsSync(SEEDS_DIR)) return [];
  const files = readdirSync(SEEDS_DIR).filter((f) => f.endsWith(suffix));
  const rows = [];
  for (const file of files) {
    const text = readFileSync(join(SEEDS_DIR, file), 'utf8');
    rows.push(...parseCsv(text));
  }
  return rows;
}

function mergeByRecordId(sheetRows, seedRows) {
  const byId = new Map();
  for (const row of seedRows) {
    if (row.record_id) byId.set(row.record_id, row);
  }
  for (const row of sheetRows) {
    if (!row.record_id) continue;
    const existing = byId.get(row.record_id);
    if (!existing) {
      byId.set(row.record_id, row);
      continue;
    }
    // Sheet wins by default, but keep a real occupation title when Sheet stored a list rank ("11").
    const merged = { ...existing, ...row };
    const sheetTitle = String(row.noc_title || '').trim();
    const seedTitle = String(existing.noc_title || '').trim();
    if (/^\d+\.?$/.test(sheetTitle) && seedTitle && !/^\d+\.?$/.test(seedTitle)) {
      merged.noc_title = seedTitle;
    }
    byId.set(row.record_id, merged);
  }
  return [...byId.values()];
}

function isActive(row) {
  const s = (row.status || '').toLowerCase();
  return !s || s === 'active';
}

/** Normalize portal recruiting flags + note heuristics into a provisional hiring_status.
 *  Portal "hiring" is only kept after Job Bank verification finds postings. */
function deriveHiringStatus(type, row) {
  if (type === 'priority_noc') return 'eligible';
  if (type === 'job') return 'open';

  const raw = String(row.recruiting_status || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (
    raw === 'not_hiring' ||
    raw === 'not_recruiting' ||
    raw === 'no' ||
    raw === 'closed'
  ) {
    return 'not_hiring';
  }

  const blob = `${row.notes || ''} ${row.employer_name || ''}`.toLowerCase();
  if (/\bnot\s+(currently\s+)?(hiring|recruiting)\b|\bnot\s+hiring\b|\bdo not contact\b/.test(blob)) {
    return 'not_hiring';
  }
  // PDF/HTML scrapes sometimes emit status phrases as fake employer names.
  const name = String(row.employer_name || '').trim().toLowerCase();
  if (
    !name ||
    name.length < 3 ||
    /^(recruiting|not currently recruiting|hiring|designated employers?)$/i.test(name)
  ) {
    return 'unknown';
  }
  if (raw === 'hiring' || raw === 'recruiting' || raw === 'yes') return 'hiring';
  if (/\b(currently\s+)?hiring\b|\brecruiting\b|\bseeking to hire\b/.test(blob)) return 'hiring';
  return 'unknown';
}

const JOB_BANK_LOCATIONS = {
  'west-kootenay': 'Nelson, BC',
  'north-okanagan-shuswap': 'Vernon, BC',
  'peace-liard': 'Fort St. John, BC',
  'pictou-county': 'New Glasgow, NS',
  'north-bay': 'North Bay, ON',
  sudbury: 'Greater Sudbury, ON',
  timmins: 'Timmins, ON',
  'sault-ste-marie': 'Sault Ste. Marie, ON',
  'thunder-bay': 'Thunder Bay, ON',
  steinbach: 'Steinbach, MB',
  'altona-rhineland': 'Altona, MB',
  brandon: 'Brandon, MB',
  'moose-jaw': 'Moose Jaw, SK',
  claresholm: 'Claresholm, AB',
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Count Job Bank postings for an employer or NOC near a community hub. */
async function fetchJobBankHits({ employerName, nocCode, communityId, province, communityName, radiusKm = 100 }) {
  const location =
    JOB_BANK_LOCATIONS[communityId] || [communityName, province].filter(Boolean).join(', ');
  const u = new URL('https://www.jobbank.gc.ca/jobsearch/jobsearch');
  u.searchParams.set('sort', 'M');
  u.searchParams.set('d', String(radiusKm));
  if (location) u.searchParams.set('locationstring', location);
  if (nocCode) u.searchParams.set('fn21', String(nocCode).replace(/\D/g, ''));
  else if (employerName) u.searchParams.set('empl', employerName);

  const res = await fetch(u, {
    headers: {
      'User-Agent': 'RCIPAggregatorBot/0.1 (+mailto:absolondesigns@gmail.com)',
      'Accept-Language': 'en-CA',
      Accept: 'text/html',
    },
  });
  if (!res.ok) throw new Error(`Job Bank HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/View\s+([\d,]+)\s+job/i);
  if (!m) return null;
  return Number(m[1].replace(/,/g, ''));
}

/**
 * Portal "hiring" claims are provisional until Job Bank shows matching postings.
 * Demote to unknown when hits are 0; keep hiring only when hits > 0.
 * Also attach Job Bank hit counts to eligible NOCs for the Job Bank button label.
 */
async function verifyHiringAgainstJobBank(listings) {
  const prevPath = join(__dirname, '..', 'web', 'public', 'data', 'listings.json');
  let prevById = new Map();
  let prevCheckedAt = null;
  if (existsSync(prevPath)) {
    try {
      const prev = JSON.parse(readFileSync(prevPath, 'utf8'));
      prevCheckedAt = prev.jobbank_checked_at || null;
      for (const l of prev.listings || []) {
        if (l?.id) prevById.set(l.id, l);
      }
    } catch {
      /* ignore stale cache */
    }
  }

  if (String(process.env.SKIP_JOBBANK || '').match(/^(1|true|yes)$/i)) {
    console.log('SKIP_JOBBANK set — copying prior jobbank_hits from listings.json when available');
    for (const listing of listings) {
      const prev = prevById.get(listing.id);
      if (!prev) continue;
      if ('jobbank_hits' in prev) listing.jobbank_hits = prev.jobbank_hits;
      if (prev.jobbank_checked_at) listing.jobbank_checked_at = prev.jobbank_checked_at;
      if (
        listing.type === 'employer' &&
        listing.hiring_status === 'hiring' &&
        typeof prev.jobbank_hits === 'number'
      ) {
        listing.hiring_status = prev.jobbank_hits > 0 ? 'hiring' : 'unknown';
      }
    }
    return prevCheckedAt;
  }

  const checkedAt = new Date().toISOString();
  const candidates = listings.filter((l) => l.type === 'employer' && l.hiring_status === 'hiring');
  console.log(`Verifying Job Bank hits for ${candidates.length} portal-hiring employers…`);
  let kept = 0;
  let demoted = 0;
  let failed = 0;

  for (const listing of candidates) {
    try {
      const hits = await fetchJobBankHits({
        employerName: listing.employer_name || listing.title,
        communityId: listing.community_id,
        province: listing.province,
        communityName: listing.community_name,
        radiusKm: 100,
      });
      listing.jobbank_hits = hits;
      listing.jobbank_checked_at = checkedAt;
      if (hits == null) {
        listing.hiring_status = 'unknown';
        failed += 1;
      } else if (hits > 0) {
        listing.hiring_status = 'hiring';
        kept += 1;
      } else {
        listing.hiring_status = 'unknown';
        demoted += 1;
      }
      console.log(
        `  ${listing.employer_name}: ${hits == null ? 'parse-fail' : hits + ' hits'} → ${listing.hiring_status}`,
      );
    } catch (err) {
      listing.jobbank_hits = null;
      listing.jobbank_checked_at = checkedAt;
      listing.hiring_status = 'unknown';
      failed += 1;
      console.warn(`  ${listing.employer_name}: ${err.message} → unknown`);
    }
    await sleep(350);
  }

  console.log(`Job Bank verify: kept ${kept} hiring, demoted ${demoted}, failed ${failed}`);

  const nocs = listings.filter((l) => l.type === 'priority_noc' && l.noc_code);
  console.log(`Verifying Job Bank hits for ${nocs.length} eligible NOCs (parallel)…`);
  const cache = new Map();
  let nocOk = 0;
  let nocFail = 0;

  async function hitsForNoc(listing) {
    const key = `${listing.noc_code}|${listing.community_id}`;
    if (cache.has(key)) return cache.get(key);
    const hits = await fetchJobBankHits({
      nocCode: listing.noc_code,
      communityId: listing.community_id,
      province: listing.province,
      communityName: listing.community_name,
      radiusKm: 500,
    });
    cache.set(key, hits);
    return hits;
  }

  await mapPool(nocs, 8, async (listing) => {
    try {
      const hits = await hitsForNoc(listing);
      listing.jobbank_hits = hits;
      listing.jobbank_checked_at = checkedAt;
      if (hits == null) nocFail += 1;
      else nocOk += 1;
    } catch (err) {
      listing.jobbank_hits = null;
      listing.jobbank_checked_at = checkedAt;
      nocFail += 1;
      console.warn(`  NOC ${listing.noc_code} (${listing.community_id}): ${err.message}`);
    }
  });
  console.log(`NOC Job Bank verify: ${nocOk} counted, ${nocFail} failed (${cache.size} unique queries)`);
  return checkedAt;
}

/** Run async work over items with a fixed concurrency limit. */
async function mapPool(items, concurrency, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

function mapCommunity(c, source) {
  return {
    id: c.community_id || c.id,
    name: c.name,
    province: c.province || '',
    portal_url: c.portal_url || '',
    jobs_url: c.jobs_url || c.portal_url || '',
    scrape_status: c.scrape_status || '',
    source,
  };
}

function mergeCommunities(sheetRows, localPayload) {
  const byId = new Map();

  for (const c of sheetRows) {
    if (String(c.active).toUpperCase() === 'TRUE') {
      byId.set(c.community_id, mapCommunity(c, 'sheet'));
    }
  }

  for (const c of localPayload.communities || []) {
    if (!c.active) continue;
    if (!byId.has(c.community_id)) {
      byId.set(c.community_id, mapCommunity(c, 'local'));
    } else {
      const existing = byId.get(c.community_id);
      // Local registry can promote directory → ready before Sheet is updated
      if (c.scrape_status && c.scrape_status !== 'directory') {
        if (!existing.scrape_status || existing.scrape_status === 'directory') {
          existing.scrape_status = c.scrape_status;
          existing.source = 'local+sheet';
        }
      }
    }
  }

  // Stable order: local registry order when available, else sheet order
  const order = (localPayload.communities || []).map((c) => c.community_id);
  const ordered = [];
  for (const id of order) {
    if (byId.has(id)) ordered.push(byId.get(id));
  }
  for (const [id, c] of byId) {
    if (!order.includes(id)) ordered.push(c);
  }
  return ordered;
}

async function main() {
  const localPayload = JSON.parse(readFileSync(LOCAL_COMMUNITIES, 'utf8'));
  const [sheetCommunities, sheetPriorityNocs, sheetEmployers, jobs] = await Promise.all([
    fetchSheet('database'),
    fetchSheet('priority_nocs'),
    fetchSheet('employers'),
    fetchSheet('jobs'),
  ]);

  const priorityNocs = mergeByRecordId(sheetPriorityNocs, loadSeedRows('-priority-nocs.csv'));
  const employers = mergeByRecordId(sheetEmployers, loadSeedRows('-employers.csv'));
  const seedNocCount = loadSeedRows('-priority-nocs.csv').length;
  const seedEmpCount = loadSeedRows('-employers.csv').length;

  const activeCommunities = mergeCommunities(sheetCommunities, localPayload);
  const communityMeta = Object.fromEntries(
    [
      ...sheetCommunities.map((c) => [c.community_id, c]),
      ...(localPayload.communities || []).map((c) => [
        c.community_id,
        {
          community_id: c.community_id,
          name: c.name,
          province: c.province,
          portal_url: c.portal_url,
          jobs_url: c.jobs_url || c.portal_url,
          priority_nocs_url: c.priority_nocs_url || '',
          employers_url: c.employers_url || '',
          active: c.active ? 'TRUE' : 'FALSE',
          scrape_status: c.scrape_status || '',
        },
      ]),
    ],
  );

  const listings = [];

  for (const row of priorityNocs.filter(isActive)) {
    const meta = communityMeta[row.community_id] || {};
    listings.push({
      id: row.record_id,
      type: 'priority_noc',
      community_id: row.community_id,
      community_name: meta.name || row.community_id,
      province: meta.province || '',
      noc_code: row.noc_code,
      title: row.noc_title,
      sector: row.sector,
      employer_name: '',
      locations: '',
      source_url: row.source_url || meta.priority_nocs_url || meta.portal_url || '',
      portal_url: meta.portal_url || '',
      jobs_url: meta.jobs_url || '',
      notes: row.restriction_notes || '',
      updated_at: row.last_seen_at || '',
      hiring_status: deriveHiringStatus('priority_noc', row),
      jobbank_hits: null,
    });
  }

  for (const row of employers.filter(isActive)) {
    const meta = communityMeta[row.community_id] || {};
    listings.push({
      id: row.record_id,
      type: 'employer',
      community_id: row.community_id,
      community_name: meta.name || row.community_id,
      province: meta.province || '',
      noc_code: '',
      title: row.employer_name,
      sector: row.sector,
      employer_name: row.employer_name,
      locations: row.locations || '',
      source_url: row.source_url || meta.employers_url || meta.portal_url || '',
      portal_url: meta.portal_url || '',
      jobs_url: meta.jobs_url || '',
      notes: row.notes || '',
      updated_at: row.last_seen_at || '',
      hiring_status: deriveHiringStatus('employer', row),
      jobbank_hits: null,
    });
  }

  for (const row of jobs.filter(isActive)) {
    const meta = communityMeta[row.community_id] || {};
    listings.push({
      id: row.record_id,
      type: 'job',
      community_id: row.community_id,
      community_name: meta.name || row.community_id,
      province: meta.province || '',
      noc_code: row.noc_code,
      title: row.job_title,
      sector: '',
      employer_name: row.employer_name,
      locations: row.location || '',
      source_url: row.source_url || '',
      portal_url: meta.portal_url || '',
      jobs_url: meta.jobs_url || '',
      notes: row.notes || '',
      updated_at: row.last_seen_at || row.posted_at || '',
      hiring_status: deriveHiringStatus('job', row),
    });
  }

  const jobbankCheckedAt = await verifyHiringAgainstJobBank(listings);

  const payload = {
    generated_at: new Date().toISOString(),
    jobbank_checked_at: jobbankCheckedAt,
    sheet_id: SHEET_ID,
    counts: {
      communities: activeCommunities.length,
      priority_nocs: listings.filter((l) => l.type === 'priority_noc').length,
      employers: listings.filter((l) => l.type === 'employer').length,
      jobs: listings.filter((l) => l.type === 'job').length,
      total: listings.length,
    },
    communities: activeCommunities.map((c) => ({
      id: c.id,
      name: c.name,
      province: c.province,
      portal_url: c.portal_url,
      jobs_url: c.jobs_url,
      scrape_status: c.scrape_status,
    })),
    listings,
  };

  const outDir = join(__dirname, '..', 'web', 'public', 'data');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'listings.json');
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log('Wrote', outPath);
  console.log(payload.counts);
  if (seedNocCount || seedEmpCount) {
    console.log(`Merged local seeds: ${seedNocCount} NOCs, ${seedEmpCount} employers`);
  }
  console.log(
    'Communities:',
    payload.communities.map((c) => `${c.id}${c.scrape_status === 'directory' ? ' (directory)' : ''}`).join(', '),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
