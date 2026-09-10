/**
 * Export Google Sheet tabs → web/public/data/listings.json
 * Community directory merges Sheet `database` + local data/communities.json
 * so all active RCIP regions appear even before Sheet rows are updated.
 *
 * Usage: node scripts/export-listings.mjs
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1H3RDFGINQ-lBVaR_EOn1LDU4ezWf7q2bfY5XnUAFZpo';
const LOCAL_COMMUNITIES = join(__dirname, '..', 'data', 'communities.json');

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

function isActive(row) {
  const s = (row.status || '').toLowerCase();
  return !s || s === 'active';
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
  const [sheetCommunities, priorityNocs, employers, jobs] = await Promise.all([
    fetchSheet('database'),
    fetchSheet('priority_nocs'),
    fetchSheet('employers'),
    fetchSheet('jobs'),
  ]);

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
    });
  }

  const payload = {
    generated_at: new Date().toISOString(),
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
  console.log(
    'Communities:',
    payload.communities.map((c) => `${c.id}${c.scrape_status === 'directory' ? ' (directory)' : ''}`).join(', '),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
