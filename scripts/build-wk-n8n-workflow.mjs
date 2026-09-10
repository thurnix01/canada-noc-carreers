/**
 * Builds n8n/west-kootenay-scrape.workflow.json
 * Run: node scripts/build-wk-n8n-workflow.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHEET_ID = '1H3RDFGINQ-lBVaR_EOn1LDU4ezWf7q2bfY5XnUAFZpo';

const sharedHelpers = `
const COMMUNITY_ID = 'west-kootenay';
const YEAR = '2026';
const PRIORITIES_URL = 'https://westkootenayimmigration.ca/priorities/';
const EMPLOYERS_URL = 'https://westkootenayimmigration.ca/designated-employers/';

function stripTags(html) {
  return String(html || '')
    .replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
    .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8211;/g, '–')
    .replace(/&#038;/g, '&')
    .replace(/\\s+/g, ' ')
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
  const re = /<table[^>]*>([\\s\\S]*?)<\\/table>/gi;
  let m;
  while ((m = re.exec(html))) tables.push(m[1]);
  return tables;
}

function tableRows(tableHtml) {
  const rows = [];
  const re = /<tr[^>]*>([\\s\\S]*?)<\\/tr>/gi;
  let m;
  while ((m = re.exec(tableHtml))) {
    const cells = [];
    const cre = /<t[dh][^>]*>([\\s\\S]*?)<\\/t[dh]>/gi;
    let c;
    while ((c = cre.exec(m[1]))) cells.push(stripTags(c[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function parsePriorityNocs(html, nowIso) {
  const tables = extractTables(html);
  const out = [];
  for (const table of tables) {
    const rows = tableRows(table);
    for (const cells of rows) {
      if (cells.length < 2) continue;
      const noc = (cells[1] || '').trim();
      if (!/^\\d{5}$/.test(noc)) continue;
      const title = (cells[0] || '').replace(/\\s*\\(new\\)\\s*/gi, ' ').trim();
      const notes = (cells[5] || '').trim();
      out.push({
        record_id: COMMUNITY_ID + '|' + noc + '|' + YEAR,
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
  }
  return out;
}

function parseEmployers(html, nowIso) {
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
  const updatedMatch = html.match(/Last updated:\\s*([^<]+)/i);
  if (updatedMatch) listUpdated = stripTags(updatedMatch[1]);

  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
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
    const tableMatch = chunk.match(/<table[^>]*>([\\s\\S]*?)<\\/table>/i);
    if (!tableMatch) continue;
    const rows = tableRows(tableMatch[1]);
    for (const cells of rows) {
      for (const cell of cells) {
        const name = cell.trim();
        if (!name || /^employer name$/i.test(name) || name.length < 2) continue;
        const comma = name.indexOf(',');
        const locations = comma > 0 ? name.slice(comma + 1).trim() : '';
        out.push({
          record_id: COMMUNITY_ID + '|' + normalizeIdPart(name),
          community_id: COMMUNITY_ID,
          employer_name: name,
          locations,
          sector: isDeDesignated ? 'De-designated' : sector,
          recruiting_status: isDeDesignated ? 'de_designated' : 'unknown',
          source_url: EMPLOYERS_URL,
          source_type: 'html',
          first_seen_at: nowIso,
          last_seen_at: nowIso,
          status: isDeDesignated ? 'removed' : 'active',
          manual_override: 'FALSE',
          review_status: 'new',
          notes: listUpdated ? 'Source list updated: ' + listUpdated : '',
        });
      }
    }
  }
  const seen = new Set();
  return out.filter((r) => {
    if (seen.has(r.record_id)) return false;
    seen.add(r.record_id);
    return true;
  });
}

function mergeUpserts(scraped, existingRows) {
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
    if ((prev.community_id || '') !== COMMUNITY_ID) continue;
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
`.trim();

const parseNocsCode = `
${sharedHelpers}

const raw = $input.first().json;
const html = typeof raw === 'string' ? raw : (raw.data || raw.body || '');
const nowIso = new Date().toISOString();
const scraped = parsePriorityNocs(typeof html === 'string' ? html : String(html), nowIso);

let existing = [];
try {
  existing = $('Read Priority NOCs').all().map((i) => i.json);
} catch (e) {
  existing = [];
}

const { upserts, stale } = mergeUpserts(scraped, existing);
const rows = [...upserts, ...stale];

const staticData = $getWorkflowStaticData('global');
staticData.wk_noc_count = scraped.length;
staticData.wk_noc_upserts = upserts.length;
staticData.wk_noc_stale = stale.length;
staticData.wk_run_started = staticData.wk_run_started || nowIso;

if (!rows.length) {
  return [{ json: { _skip: true, message: 'No priority NOC rows' } }];
}
return rows.map((r) => ({ json: r }));
`.trim();

const parseEmployersCode = `
${sharedHelpers}

const raw = $input.first().json;
const html = typeof raw === 'string' ? raw : (raw.data || raw.body || '');
const nowIso = new Date().toISOString();
const scraped = parseEmployers(typeof html === 'string' ? html : String(html), nowIso);

let existing = [];
try {
  existing = $('Read Employers').all().map((i) => i.json);
} catch (e) {
  existing = [];
}

const { upserts, stale } = mergeUpserts(scraped, existing);
const rows = [...upserts, ...stale];

const staticData = $getWorkflowStaticData('global');
staticData.wk_employer_count = scraped.length;
staticData.wk_employer_upserts = upserts.length;
staticData.wk_employer_stale = stale.length;

if (!rows.length) {
  return [{ json: { _skip: true, message: 'No employer rows' } }];
}
return rows.map((r) => ({ json: r }));
`.trim();

const runLogCode = `
const staticData = $getWorkflowStaticData('global');
const started = staticData.wk_run_started || new Date().toISOString();
const finished = new Date().toISOString();
const nocs = staticData.wk_noc_count || 0;
const employers = staticData.wk_employer_count || 0;
const upserts = (staticData.wk_noc_upserts || 0) + (staticData.wk_employer_upserts || 0);
const stale = (staticData.wk_noc_stale || 0) + (staticData.wk_employer_stale || 0);

return [{
  json: {
    run_id: 'wk-' + started,
    started_at: started,
    finished_at: finished,
    community_id: 'west-kootenay',
    adapter: 'wk-html-nocs+employers',
    rows_upserted: String(upserts),
    rows_stale: String(stale),
    errors: '',
    ok: 'TRUE',
    notes: 'nocs=' + nocs + '; employers=' + employers,
  },
}];
`.trim();

function sheetsCred() {
  return {
    googleSheetsOAuth2Api: {
      id: 'GOOGLE_SHEETS_CREDENTIAL_ID',
      name: 'Google Sheets',
    },
  };
}

function sheetDoc() {
  return {
    __rl: true,
    mode: 'id',
    value: SHEET_ID,
  };
}

function sheetName(name) {
  return {
    __rl: true,
    mode: 'name',
    value: name,
  };
}

const workflow = {
  name: 'RCIP West Kootenay — NOCs + Employers',
  nodes: [
    {
      parameters: {},
      id: 'manual-trigger',
      name: 'Manual Run',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [0, 300],
    },
    {
      parameters: {
        rule: {
          interval: [
            {
              field: 'weeks',
              weeksInterval: 1,
              triggerAtDay: [1],
              triggerAtHour: 6,
              triggerAtMinute: 0,
            },
          ],
        },
      },
      id: 'schedule-trigger',
      name: 'Weekly Schedule',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [0, 120],
      notesInFlow: true,
      notes:
        'Weekly Mon 06:00 (workflow timezone America/Vancouver). Keep Manual Run for ad-hoc. NOS runs at 07:00.',
    },
    {
      parameters: {
        jsCode:
          "const staticData = $getWorkflowStaticData('global');\nstaticData.wk_run_started = new Date().toISOString();\nstaticData.wk_noc_count = 0;\nstaticData.wk_noc_upserts = 0;\nstaticData.wk_noc_stale = 0;\nstaticData.wk_employer_count = 0;\nstaticData.wk_employer_upserts = 0;\nstaticData.wk_employer_stale = 0;\nreturn [{ json: { ok: true } }];",
      },
      id: 'init-run',
      name: 'Init Run',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [220, 300],
    },
    {
      parameters: {
        documentId: sheetDoc(),
        sheetName: sheetName('priority_nocs'),
        options: {},
      },
      id: 'read-priority-nocs',
      name: 'Read Priority NOCs',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.5,
      position: [440, 180],
      alwaysOutputData: true,
      credentials: sheetsCred(),
    },
    {
      parameters: {
        url: 'https://westkootenayimmigration.ca/priorities/',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'User-Agent',
              value: 'RCIPAggregatorBot/0.1 (+mailto:absolondesigns@gmail.com)',
            },
            { name: 'Accept', value: 'text/html,application/xhtml+xml' },
          ],
        },
        options: {
          response: {
            response: {
              responseFormat: 'text',
            },
          },
        },
      },
      id: 'fetch-priorities',
      name: 'Fetch Priorities HTML',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [440, 420],
    },
    {
      parameters: { jsCode: parseNocsCode },
      id: 'parse-nocs',
      name: 'Parse + Merge NOCs',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [680, 300],
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
          conditions: [
            {
              id: 'skip-check',
              leftValue: '={{ $json._skip }}',
              rightValue: true,
              operator: { type: 'boolean', operation: 'notEquals' },
            },
          ],
          combinator: 'and',
        },
        options: {},
      },
      id: 'if-nocs',
      name: 'Has NOC Rows?',
      type: 'n8n-nodes-base.filter',
      typeVersion: 2,
      position: [900, 300],
    },
    {
      parameters: {
        operation: 'appendOrUpdate',
        documentId: sheetDoc(),
        sheetName: sheetName('priority_nocs'),
        columns: {
          mappingMode: 'defineBelow',
          value: {
            record_id: '={{ $json.record_id }}',
            community_id: '={{ $json.community_id }}',
            noc_code: '={{ $json.noc_code }}',
            noc_title: '={{ $json.noc_title }}',
            sector: '={{ $json.sector }}',
            year: '={{ $json.year }}',
            is_secondary: '={{ $json.is_secondary }}',
            restriction_notes: '={{ $json.restriction_notes }}',
            source_url: '={{ $json.source_url }}',
            source_type: '={{ $json.source_type }}',
            first_seen_at: '={{ $json.first_seen_at }}',
            last_seen_at: '={{ $json.last_seen_at }}',
            status: '={{ $json.status }}',
            manual_override: '={{ $json.manual_override }}',
            review_status: '={{ $json.review_status }}',
          },
          matchingColumns: ['record_id'],
          schema: [
            { id: 'record_id', displayName: 'record_id', required: false, defaultMatch: true, display: true, type: 'string', canBeUsedToMatch: true },
            { id: 'community_id', displayName: 'community_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'noc_code', displayName: 'noc_code', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'noc_title', displayName: 'noc_title', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'sector', displayName: 'sector', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'year', displayName: 'year', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'is_secondary', displayName: 'is_secondary', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'restriction_notes', displayName: 'restriction_notes', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'source_url', displayName: 'source_url', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'source_type', displayName: 'source_type', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'first_seen_at', displayName: 'first_seen_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'last_seen_at', displayName: 'last_seen_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'manual_override', displayName: 'manual_override', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'review_status', displayName: 'review_status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          ],
        },
        options: {},
      },
      id: 'upsert-nocs',
      name: 'Upsert Priority NOCs',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.5,
      position: [1120, 300],
      credentials: sheetsCred(),
    },
    {
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode:
          "await new Promise((r) => setTimeout(r, 3000));\nreturn [{ json: { delayed: true } }];",
      },
      id: 'wait-crawl-delay',
      name: 'Crawl Delay 3s',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1340, 300],
    },
    {
      parameters: {
        documentId: sheetDoc(),
        sheetName: sheetName('employers'),
        options: {},
      },
      id: 'read-employers',
      name: 'Read Employers',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.5,
      position: [1560, 180],
      alwaysOutputData: true,
      credentials: sheetsCred(),
    },
    {
      parameters: {
        url: 'https://westkootenayimmigration.ca/designated-employers/',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'User-Agent',
              value: 'RCIPAggregatorBot/0.1 (+mailto:absolondesigns@gmail.com)',
            },
            { name: 'Accept', value: 'text/html,application/xhtml+xml' },
          ],
        },
        options: {
          response: {
            response: {
              responseFormat: 'text',
            },
          },
        },
      },
      id: 'fetch-employers',
      name: 'Fetch Employers HTML',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1560, 420],
    },
    {
      parameters: { jsCode: parseEmployersCode },
      id: 'parse-employers',
      name: 'Parse + Merge Employers',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1780, 300],
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
          conditions: [
            {
              id: 'skip-emp',
              leftValue: '={{ $json._skip }}',
              rightValue: true,
              operator: { type: 'boolean', operation: 'notEquals' },
            },
          ],
          combinator: 'and',
        },
        options: {},
      },
      id: 'if-employers',
      name: 'Has Employer Rows?',
      type: 'n8n-nodes-base.filter',
      typeVersion: 2,
      position: [2000, 300],
    },
    {
      parameters: {
        operation: 'appendOrUpdate',
        documentId: sheetDoc(),
        sheetName: sheetName('employers'),
        columns: {
          mappingMode: 'defineBelow',
          value: {
            record_id: '={{ $json.record_id }}',
            community_id: '={{ $json.community_id }}',
            employer_name: '={{ $json.employer_name }}',
            locations: '={{ $json.locations }}',
            sector: '={{ $json.sector }}',
            recruiting_status: '={{ $json.recruiting_status }}',
            source_url: '={{ $json.source_url }}',
            source_type: '={{ $json.source_type }}',
            first_seen_at: '={{ $json.first_seen_at }}',
            last_seen_at: '={{ $json.last_seen_at }}',
            status: '={{ $json.status }}',
            manual_override: '={{ $json.manual_override }}',
            review_status: '={{ $json.review_status }}',
            notes: '={{ $json.notes }}',
          },
          matchingColumns: ['record_id'],
          schema: [
            { id: 'record_id', displayName: 'record_id', required: false, defaultMatch: true, display: true, type: 'string', canBeUsedToMatch: true },
            { id: 'community_id', displayName: 'community_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'employer_name', displayName: 'employer_name', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'locations', displayName: 'locations', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'sector', displayName: 'sector', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'recruiting_status', displayName: 'recruiting_status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'source_url', displayName: 'source_url', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'source_type', displayName: 'source_type', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'first_seen_at', displayName: 'first_seen_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'last_seen_at', displayName: 'last_seen_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'manual_override', displayName: 'manual_override', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'review_status', displayName: 'review_status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'notes', displayName: 'notes', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          ],
        },
        options: {},
      },
      id: 'upsert-employers',
      name: 'Upsert Employers',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.5,
      position: [2220, 300],
      credentials: sheetsCred(),
    },
    {
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: runLogCode,
      },
      id: 'build-run-log',
      name: 'Build Run Log',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2440, 300],
    },
    {
      parameters: {
        operation: 'append',
        documentId: sheetDoc(),
        sheetName: sheetName('run_log'),
        columns: {
          mappingMode: 'defineBelow',
          value: {
            run_id: '={{ $json.run_id }}',
            started_at: '={{ $json.started_at }}',
            finished_at: '={{ $json.finished_at }}',
            community_id: '={{ $json.community_id }}',
            adapter: '={{ $json.adapter }}',
            rows_upserted: '={{ $json.rows_upserts || $json.rows_upserted }}',
            rows_stale: '={{ $json.rows_stale }}',
            errors: '={{ $json.errors }}',
            ok: '={{ $json.ok }}',
          },
          schema: [
            { id: 'run_id', displayName: 'run_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'started_at', displayName: 'started_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'finished_at', displayName: 'finished_at', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'community_id', displayName: 'community_id', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'adapter', displayName: 'adapter', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'rows_upserted', displayName: 'rows_upserted', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'rows_stale', displayName: 'rows_stale', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'errors', displayName: 'errors', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
            { id: 'ok', displayName: 'ok', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: false },
          ],
        },
        options: {},
      },
      id: 'append-run-log',
      name: 'Append Run Log',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.5,
      position: [2660, 300],
      credentials: sheetsCred(),
    },
  ],
  connections: {
    'Manual Run': {
      main: [[{ node: 'Init Run', type: 'main', index: 0 }]],
    },
    'Weekly Schedule': {
      main: [[{ node: 'Init Run', type: 'main', index: 0 }]],
    },
    'Init Run': {
      main: [[{ node: 'Read Priority NOCs', type: 'main', index: 0 }]],
    },
    'Read Priority NOCs': {
      main: [[{ node: 'Fetch Priorities HTML', type: 'main', index: 0 }]],
    },
    'Fetch Priorities HTML': {
      main: [[{ node: 'Parse + Merge NOCs', type: 'main', index: 0 }]],
    },
    'Parse + Merge NOCs': {
      main: [[{ node: 'Has NOC Rows?', type: 'main', index: 0 }]],
    },
    'Has NOC Rows?': {
      main: [[{ node: 'Upsert Priority NOCs', type: 'main', index: 0 }]],
    },
    'Upsert Priority NOCs': {
      main: [[{ node: 'Crawl Delay 3s', type: 'main', index: 0 }]],
    },
    'Crawl Delay 3s': {
      main: [[{ node: 'Read Employers', type: 'main', index: 0 }]],
    },
    'Read Employers': {
      main: [[{ node: 'Fetch Employers HTML', type: 'main', index: 0 }]],
    },
    'Fetch Employers HTML': {
      main: [[{ node: 'Parse + Merge Employers', type: 'main', index: 0 }]],
    },
    'Parse + Merge Employers': {
      main: [[{ node: 'Has Employer Rows?', type: 'main', index: 0 }]],
    },
    'Has Employer Rows?': {
      main: [[{ node: 'Upsert Employers', type: 'main', index: 0 }]],
    },
    'Upsert Employers': {
      main: [[{ node: 'Build Run Log', type: 'main', index: 0 }]],
    },
    'Build Run Log': {
      main: [[{ node: 'Append Run Log', type: 'main', index: 0 }]],
    },
  },
  settings: {
    executionOrder: 'v1',
    timezone: 'America/Vancouver',
  },
  staticData: null,
  meta: {
    templateCredsSetupCompleted: false,
  },
  pinData: {},
};

const outPath = join(__dirname, '..', 'n8n', 'west-kootenay-scrape.workflow.json');
writeFileSync(outPath, JSON.stringify(workflow, null, 2));
console.log('Wrote', outPath);
console.log('NOC parse code chars', parseNocsCode.length);
console.log('Employer parse code chars', parseEmployersCode.length);
