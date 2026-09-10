/**
 * Builds n8n/north-okanagan-shuswap-scrape.workflow.json
 * Run: node scripts/build-nos-n8n-workflow.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHEET_ID = '1H3RDFGINQ-lBVaR_EOn1LDU4ezWf7q2bfY5XnUAFZpo';

const sharedHelpers = `
const COMMUNITY_ID = 'north-okanagan-shuswap';
const YEAR = '2026';
const PRIORITIES_URL = 'https://rcipnorthokanaganshuswap.com/priority-sectors-nocs/';
const RESOURCES_URL = 'https://rcipnorthokanaganshuswap.com/resources-and-policies/';

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

function findLatestEmployerListPdf(html) {
  const urls = new Set();
  const hrefRe = /href="(https?:\\/\\/[^"]+\\.pdf[^"]*|\\/[^"]+\\.pdf[^"]*)"/gi;
  let m;
  while ((m = hrefRe.exec(html))) {
    let url = m[1];
    if (url.startsWith('/')) url = 'https://rcipnorthokanaganshuswap.com' + url;
    if (/designated-employer-list/i.test(url)) urls.add(url);
  }
  const withText = /href="([^"]+\\.pdf[^"]*)"[^>]*>([^<]*Designated Employer List[^<]*)</gi;
  while ((m = withText.exec(html))) {
    let url = m[1];
    if (url.startsWith('/')) url = 'https://rcipnorthokanaganshuswap.com' + url;
    urls.add(url);
  }
  const list = [...urls].sort();
  return list.length ? list[list.length - 1] : '';
}

function parsePriorityNocs(html, nowIso) {
  const tables = extractTables(html);
  const restrictionByNoc = new Map();
  if (tables[3]) {
    for (const cells of tableRows(tables[3])) {
      const blob = cells.join(' ');
      const nocMatch = blob.match(/(\\d{5})\\s*[–—-]/);
      if (!nocMatch) continue;
      const notes = (cells[2] || cells.slice(2).join(' ') || '').trim();
      if (notes) restrictionByNoc.set(nocMatch[1], notes);
    }
  }
  const out = [];
  const nocTable = tables[1] || tables.find((t) => /\\d{5}\\s*[–—-]/.test(t));
  if (!nocTable) return out;
  for (const cells of tableRows(nocTable)) {
    const blob = cells.join(' | ');
    const nocMatch = blob.match(/\\b(\\d{5})\\s*[–—-]\\s*([^|]+)/);
    if (!nocMatch) continue;
    const noc = nocMatch[1];
    let title = nocMatch[2].trim();
    for (const cell of cells) {
      const cm = cell.match(/^(\\d{5})\\s*[–—-]\\s*(.+)$/);
      if (cm) {
        title = cm[2].trim();
        break;
      }
    }
    const cap = cells.find((c) => /per year|N\\/A/i.test(c)) || '';
    const notes = [restrictionByNoc.get(noc) || '', cap && cap !== 'N/A' ? 'Employer cap: ' + cap : '']
      .filter(Boolean)
      .join(' | ');
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
  const seen = new Set();
  return out.filter((r) => {
    if (seen.has(r.record_id)) return false;
    seen.add(r.record_id);
    return true;
  });
}

function parseEmployersFromPdfText(text, sourceUrl, nowIso) {
  let t = String(text || '').replace(/\\r/g, '');
  t = t.replace(/Education, Law and Social, Community\\s*\\n\\s*and Government Services/g, 'Education, Law and Social, Community and Government Services');
  t = t.replace(/RCIP NOS\\s+Designated Employer List\\s+[^\\n]+/g, '\\n');
  t = t.replace(/--\\s*\\d+\\s*of\\s*\\d+\\s*--/g, '\\n');
  t = t.replace(/Designated Employer List\\n?/g, '\\n');
  t = t.replace(/North Okanagan-Shuswap Rural Community Immigration Pilot \\(RCIP\\)/g, '\\n');
  t = t.replace(/Priority Sector\\s+Business Legal Name/g, '\\n');
  t = t.replace(/The following employers[\\s\\S]*?posted publicly by the employers\\./g, '\\n');
  t = t.replace(/Please note, the employers with an asterisk[\\s\\S]*$/i, '\\n');
  const listDateMatch = String(text).match(/as of\\s+([A-Za-z]+\\s+\\d{1,2},\\s+\\d{4})/i);
  const listUpdated = listDateMatch ? listDateMatch[1] : '';
  const lines = t.split('\\n').map((l) => l.replace(/\\t/g, ' ').replace(/\\s+/g, ' ').trim()).filter(Boolean);
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
    const isCont = prev && (/^(Ltd\\.?|Inc\\.?|Corp\\.?|Limited|Society|Association|LLP|LLC)\\.?$/i.test(row.name) || (/^[a-z]/.test(row.name) && row.name.length < 40));
    if (isCont) {
      prev.name = (prev.name + ' ' + row.name).replace(/\\s+/g, ' ').trim();
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
    const starred = /\\*$/.test(row.name.trim());
    out.push({
      record_id: COMMUNITY_ID + '|' + normalizeIdPart(row.name),
      community_id: COMMUNITY_ID,
      employer_name: row.name.replace(/\\*+$/, '').trim(),
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
      notes: [listUpdated ? 'Source list updated: ' + listUpdated : '', starred ? 'Marked * on source list (fast food / gas station note may apply)' : ''].filter(Boolean).join(' | '),
    });
  }
  return out;
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
    } else upserts.push(row);
  }
  const stale = [];
  for (const [id, prev] of existingById) {
    if (scrapedIds.has(id)) continue;
    if (String(prev.manual_override).toUpperCase() === 'TRUE') continue;
    if ((prev.community_id || '') !== COMMUNITY_ID) continue;
    if (prev.status === 'stale' || prev.status === 'removed') continue;
    stale.push({ ...prev, status: 'stale', last_seen_at: nowIso, review_status: 'needs_review' });
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
try { existing = $('Read Priority NOCs').all().map((i) => i.json); } catch (e) { existing = []; }

const { upserts, stale } = mergeUpserts(scraped, existing);
const rows = [...upserts, ...stale];
const staticData = $getWorkflowStaticData('global');
staticData.nos_noc_count = scraped.length;
staticData.nos_noc_upserts = upserts.length;
staticData.nos_noc_stale = stale.length;
staticData.nos_run_started = staticData.nos_run_started || nowIso;

if (!rows.length) return [{ json: { _skip: true, message: 'No priority NOC rows' } }];
return rows.map((r) => ({ json: r }));
`.trim();

const findPdfCode = `
${sharedHelpers}

const raw = $input.first().json;
const html = typeof raw === 'string' ? raw : (raw.data || raw.body || '');
const pdfUrl = findLatestEmployerListPdf(typeof html === 'string' ? html : String(html));
if (!pdfUrl) throw new Error('Could not find Designated Employer List PDF on resources page');
const staticData = $getWorkflowStaticData('global');
staticData.nos_pdf_url = pdfUrl;
return [{ json: { pdfUrl } }];
`.trim();

const parseEmployersCode = `
${sharedHelpers}

const item = $input.first().json;
const text = typeof item === 'string'
  ? item
  : (item.text || item.data || item.content || item.pdfText || '');
const staticData = $getWorkflowStaticData('global');
const sourceUrl = staticData.nos_pdf_url || RESOURCES_URL;
const nowIso = new Date().toISOString();
const scraped = parseEmployersFromPdfText(String(text || ''), sourceUrl, nowIso);

let existing = [];
try { existing = $('Read Employers').all().map((i) => i.json); } catch (e) { existing = []; }

const { upserts, stale } = mergeUpserts(scraped, existing);
const rows = [...upserts, ...stale];
staticData.nos_employer_count = scraped.length;
staticData.nos_employer_upserts = upserts.length;
staticData.nos_employer_stale = stale.length;

if (!scraped.length) throw new Error('PDF text parsed to 0 employers — check Extract From File output field');
if (!rows.length) return [{ json: { _skip: true, message: 'No employer rows' } }];
return rows.map((r) => ({ json: r }));
`.trim();

const runLogCode = `
const staticData = $getWorkflowStaticData('global');
const started = staticData.nos_run_started || new Date().toISOString();
const finished = new Date().toISOString();
const nocs = staticData.nos_noc_count || 0;
const employers = staticData.nos_employer_count || 0;
const upserts = (staticData.nos_noc_upserts || 0) + (staticData.nos_employer_upserts || 0);
const stale = (staticData.nos_noc_stale || 0) + (staticData.nos_employer_stale || 0);
return [{
  json: {
    run_id: 'nos-' + started,
    started_at: started,
    finished_at: finished,
    community_id: 'north-okanagan-shuswap',
    adapter: 'nos-html-nocs+pdf-employers',
    rows_upserted: String(upserts),
    rows_stale: String(stale),
    errors: '',
    ok: 'TRUE',
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
  return { __rl: true, mode: 'id', value: SHEET_ID };
}

function sheetName(name) {
  return { __rl: true, mode: 'name', value: name };
}

const uaHeaders = {
  parameters: [
    { name: 'User-Agent', value: 'RCIPAggregatorBot/0.1 (+mailto:absolondesigns@gmail.com)' },
    { name: 'Accept', value: 'text/html,application/xhtml+xml,application/pdf' },
  ],
};

const nocUpsertColumns = {
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
};

const employerUpsertColumns = {
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
};

const workflow = {
  name: 'RCIP North Okanagan–Shuswap — NOCs + Employers',
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
              triggerAtHour: 7,
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
        'Weekly Mon 07:00 (workflow timezone America/Vancouver). Keep Manual Run for ad-hoc. WK runs at 06:00.',
    },
    {
      parameters: {
        jsCode:
          "const s=$getWorkflowStaticData('global');\ns.nos_run_started=new Date().toISOString();\ns.nos_noc_count=0;s.nos_noc_upserts=0;s.nos_noc_stale=0;\ns.nos_employer_count=0;s.nos_employer_upserts=0;s.nos_employer_stale=0;s.nos_pdf_url='';\nreturn [{json:{ok:true}}];",
      },
      id: 'init-run',
      name: 'Init Run',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [220, 300],
    },
    {
      parameters: { documentId: sheetDoc(), sheetName: sheetName('priority_nocs'), options: {} },
      id: 'read-priority-nocs',
      name: 'Read Priority NOCs',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.5,
      position: [440, 300],
      alwaysOutputData: true,
      credentials: sheetsCred(),
    },
    {
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode:
          "return [{ json: { ready: true, existing_noc_rows: $input.all().length } }];",
      },
      id: 'collapse-after-noc-read',
      name: 'Collapse After NOC Read',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [560, 300],
    },
    {
      parameters: {
        url: 'https://rcipnorthokanaganshuswap.com/priority-sectors-nocs/',
        sendHeaders: true,
        headerParameters: uaHeaders,
        options: {
          response: { response: { responseFormat: 'text' } },
          timeout: 30000,
        },
      },
      id: 'fetch-priorities',
      name: 'Fetch Priorities HTML',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [700, 300],
    },
    {
      parameters: { jsCode: parseNocsCode },
      id: 'parse-nocs',
      name: 'Parse + Merge NOCs',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [880, 300],
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
          conditions: [
            {
              id: 'skip-noc',
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
      position: [1100, 300],
    },
    {
      parameters: {
        operation: 'appendOrUpdate',
        documentId: sheetDoc(),
        sheetName: sheetName('priority_nocs'),
        columns: nocUpsertColumns,
        options: {},
      },
      id: 'upsert-nocs',
      name: 'Upsert Priority NOCs',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.5,
      position: [1320, 300],
      credentials: sheetsCred(),
    },
    {
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: 'await new Promise((r) => setTimeout(r, 5000));\nreturn [{ json: { delayed: true } }];',
      },
      id: 'delay-1',
      name: 'Crawl Delay 5s',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1540, 300],
    },
    {
      parameters: { documentId: sheetDoc(), sheetName: sheetName('employers'), options: {} },
      id: 'read-employers',
      name: 'Read Employers',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.5,
      position: [1760, 300],
      alwaysOutputData: true,
      credentials: sheetsCred(),
    },
    {
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode:
          "return [{ json: { ready: true, existing_employer_rows: $input.all().length } }];",
      },
      id: 'collapse-after-employer-read',
      name: 'Collapse After Employer Read',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1900, 300],
    },
    {
      parameters: {
        url: 'https://rcipnorthokanaganshuswap.com/resources-and-policies/',
        sendHeaders: true,
        headerParameters: uaHeaders,
        options: {
          response: { response: { responseFormat: 'text' } },
          timeout: 30000,
        },
      },
      id: 'fetch-resources',
      name: 'Fetch Resources HTML',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2100, 300],
    },
    {
      parameters: { jsCode: findPdfCode },
      id: 'find-pdf',
      name: 'Find Employer List PDF',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2200, 300],
    },
    {
      parameters: {
        url: '={{ $json.pdfUrl }}',
        sendHeaders: true,
        headerParameters: uaHeaders,
        options: {
          response: {
            response: {
              responseFormat: 'file',
            },
          },
        },
      },
      id: 'download-pdf',
      name: 'Download Employer PDF',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2420, 300],
    },
    {
      parameters: {
        operation: 'pdf',
        options: {},
      },
      id: 'extract-pdf',
      name: 'Extract PDF Text',
      type: 'n8n-nodes-base.extractFromFile',
      typeVersion: 1,
      position: [2640, 300],
    },
    {
      parameters: { jsCode: parseEmployersCode },
      id: 'parse-employers',
      name: 'Parse + Merge Employers',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2860, 300],
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
      position: [3080, 300],
    },
    {
      parameters: {
        operation: 'appendOrUpdate',
        documentId: sheetDoc(),
        sheetName: sheetName('employers'),
        columns: employerUpsertColumns,
        options: {},
      },
      id: 'upsert-employers',
      name: 'Upsert Employers',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.5,
      position: [3300, 300],
      credentials: sheetsCred(),
    },
    {
      parameters: { mode: 'runOnceForAllItems', jsCode: runLogCode },
      id: 'build-run-log',
      name: 'Build Run Log',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [3520, 300],
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
            rows_upserted: '={{ $json.rows_upserted }}',
            rows_stale: '={{ $json.rows_stale }}',
            errors: '={{ $json.errors }}',
            ok: '={{ $json.ok }}',
          },
        },
        options: {},
      },
      id: 'append-run-log',
      name: 'Append Run Log',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.5,
      position: [3740, 300],
      credentials: sheetsCred(),
    },
  ],
  connections: {
    'Manual Run': { main: [[{ node: 'Init Run', type: 'main', index: 0 }]] },
    'Weekly Schedule': { main: [[{ node: 'Init Run', type: 'main', index: 0 }]] },
    'Init Run': { main: [[{ node: 'Read Priority NOCs', type: 'main', index: 0 }]] },
    'Read Priority NOCs': { main: [[{ node: 'Collapse After NOC Read', type: 'main', index: 0 }]] },
    'Collapse After NOC Read': { main: [[{ node: 'Fetch Priorities HTML', type: 'main', index: 0 }]] },
    'Fetch Priorities HTML': { main: [[{ node: 'Parse + Merge NOCs', type: 'main', index: 0 }]] },
    'Parse + Merge NOCs': { main: [[{ node: 'Has NOC Rows?', type: 'main', index: 0 }]] },
    'Has NOC Rows?': { main: [[{ node: 'Upsert Priority NOCs', type: 'main', index: 0 }]] },
    'Upsert Priority NOCs': { main: [[{ node: 'Crawl Delay 5s', type: 'main', index: 0 }]] },
    'Crawl Delay 5s': { main: [[{ node: 'Read Employers', type: 'main', index: 0 }]] },
    'Read Employers': { main: [[{ node: 'Collapse After Employer Read', type: 'main', index: 0 }]] },
    'Collapse After Employer Read': { main: [[{ node: 'Fetch Resources HTML', type: 'main', index: 0 }]] },
    'Fetch Resources HTML': { main: [[{ node: 'Find Employer List PDF', type: 'main', index: 0 }]] },
    'Find Employer List PDF': { main: [[{ node: 'Download Employer PDF', type: 'main', index: 0 }]] },
    'Download Employer PDF': { main: [[{ node: 'Extract PDF Text', type: 'main', index: 0 }]] },
    'Extract PDF Text': { main: [[{ node: 'Parse + Merge Employers', type: 'main', index: 0 }]] },
    'Parse + Merge Employers': { main: [[{ node: 'Has Employer Rows?', type: 'main', index: 0 }]] },
    'Has Employer Rows?': { main: [[{ node: 'Upsert Employers', type: 'main', index: 0 }]] },
    'Upsert Employers': { main: [[{ node: 'Build Run Log', type: 'main', index: 0 }]] },
    'Build Run Log': { main: [[{ node: 'Append Run Log', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1', timezone: 'America/Vancouver' },
  meta: { templateCredsSetupCompleted: false },
  pinData: {},
};

const outPath = join(__dirname, '..', 'n8n', 'north-okanagan-shuswap-scrape.workflow.json');
writeFileSync(outPath, JSON.stringify(workflow, null, 2));
console.log('Wrote', outPath);
