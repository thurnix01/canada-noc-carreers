/**
 * Builds n8n/steinbach-scrape.workflow.json
 * Run: node scripts/build-steinbach-n8n-workflow.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHEET_ID = '1H3RDFGINQ-lBVaR_EOn1LDU4ezWf7q2bfY5XnUAFZpo';

const sharedHelpers = `
const COMMUNITY_ID = 'steinbach';
const YEAR = '2026';
const PORTAL_URL = 'https://steinbachedc.com/rcip/';
const FALLBACK_PDF = 'https://steinbachedc.com/wp-content/uploads/2026/09/RCIP-Designated-Employers-1.pdf';
const DEFAULT_CAP = 'Max 1 recommendation per NOC per month, max 2 recommendations per calendar year per NOC (unless noted).';
const NOC_SECTOR_BY_PREFIX = {
  '1': 'Business, finance and administration',
  '2': 'Natural and applied sciences',
  '3': 'Health',
  '4': 'Education, law and social, community and government services',
  '6': 'Sales and service',
  '7': 'Trades and transport',
  '8': 'Natural resources and agriculture',
  '9': 'Manufacturing and utilities',
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
      .replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
      .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
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

function findEmployerListPdf(html) {
  const urls = [];
  const hrefRe = /href="(https?:\\/\\/[^"]+\\.pdf[^"]*|\\/[^"]+\\.pdf[^"]*)"/gi;
  let m;
  while ((m = hrefRe.exec(html))) {
    let url = m[1];
    if (url.startsWith('/')) url = 'https://steinbachedc.com' + url;
    urls.push(url);
  }
  const designated = urls.filter((u) => /designated.?employer/i.test(u) || /RCIP-Designated/i.test(u));
  if (designated.length) {
    designated.sort();
    return designated[designated.length - 1];
  }
  const any = urls.filter((u) => /steinbach/i.test(u) && /employer/i.test(u));
  if (any.length) {
    any.sort();
    return any[any.length - 1];
  }
  return FALLBACK_PDF;
}

function parseRestrictionNotes(html) {
  const byNoc = new Map();
  const setNote = (noc, note) => {
    const prev = byNoc.get(noc) || '';
    if (!prev || note.length > prev.length) byNoc.set(noc, note);
  };
  const liRe = /<li[^>]*>([\\s\\S]*?)<\\/li>/gi;
  let m;
  while ((m = liRe.exec(html))) {
    const text = stripTags(m[1]);
    if (!/\\d{5}/.test(text)) continue;
    const notAvail = text.match(/(\\d{5})\\s*[–—-].*?[–—-]\\s*not available/i);
    if (notAvail) {
      setNote(notAvail[1], 'Not available');
      continue;
    }
    const noLimit = text.match(/(\\d{5}(?:,\\s*\\d{5})*)\\s+whereby,?\\s*no limitations apply/i);
    if (noLimit) {
      const codes = noLimit[1].match(/\\d{5}/g) || [];
      for (const noc of codes) setNote(noc, 'No recommendation limitations apply');
      continue;
    }
    const ece = text.match(/(\\d{5})\\s*[–—-]\\s*Early Childhood Educator[^–—-]*[–—-]\\s*(.+)$/i);
    if (ece) {
      setNote(ece[1], ece[2].replace(/\\s+/g, ' ').trim());
      continue;
    }
    const food = text.match(/(\\d{5})\\s*[–—-]\\s*Food Service Supervisors\\s*[–—-]\\s*(.+)$/i);
    if (food) setNote(food[1], food[2].replace(/\\s+/g, ' ').trim());
  }
  return byNoc;
}

function parsePriorityNocs(html, nowIso) {
  const restrictions = parseRestrictionNotes(html);
  const out = [];
  const seen = new Set();
  const re = /<p>\\s*(\\d{5})\\s*(?:&#8211;|[–—-])\\s*([^<]+)<\\/p>/gi;
  let m;
  while ((m = re.exec(html))) {
    const noc = m[1];
    if (seen.has(noc)) continue;
    seen.add(noc);
    const title = decodeEntities(m[2]).replace(/\\s+/g, ' ').trim();
    const special = restrictions.get(noc) || '';
    out.push({
      record_id: COMMUNITY_ID + '|' + noc + '|' + YEAR,
      community_id: COMMUNITY_ID,
      noc_code: noc,
      noc_title: title,
      sector: NOC_SECTOR_BY_PREFIX[noc[0]] || '',
      year: YEAR,
      is_secondary: 'FALSE',
      restriction_notes: special || DEFAULT_CAP,
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

function parseEmployersFromPdfText(text, sourceUrl, nowIso) {
  let t = String(text || '').replace(/\\r/g, '');
  t = t.replace(/--\\s*\\d+\\s*of\\s*\\d+\\s*--/g, '\\n');
  t = t.replace(/List of Designated Employers:\\s*/gi, '\\n');
  t = t.replace(/D4-284 Reimer Ave[^\\n]*/gi, '\\n');
  t = t.replace(/www\\.SteinbachEDC\\.com/gi, '\\n');
  t = t.replace(/Office@SteinbachEDC\\.com/gi, '\\n');
  const lines = t.split('\\n').map((l) => l.replace(/\\t/g, ' ').replace(/\\s+/g, ' ').trim()).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    if (/^\\d{3}[.\\s]?\\d{3}[.\\s]?\\d{4}$/.test(line)) continue;
    if (/reimer|steinbachedc|designated employer|list of/i.test(line)) continue;
    if (line.length < 2 || line.length > 120) continue;
    const key = line.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      record_id: COMMUNITY_ID + '|' + normalizeIdPart(line),
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
staticData.sb_noc_count = scraped.length;
staticData.sb_noc_upserts = upserts.length;
staticData.sb_noc_stale = stale.length;
staticData.sb_run_started = staticData.sb_run_started || nowIso;
staticData.sb_portal_html = typeof html === 'string' ? html : String(html);

if (!rows.length) return [{ json: { _skip: true, message: 'No priority NOC rows' } }];
return rows.map((r) => ({ json: r }));
`.trim();

const findPdfCode = `
${sharedHelpers}

const staticData = $getWorkflowStaticData('global');
const html = staticData.sb_portal_html || '';
const pdfUrl = findEmployerListPdf(html);
if (!pdfUrl) throw new Error('Could not find Designated Employers PDF on Steinbach RCIP page');
staticData.sb_pdf_url = pdfUrl;
return [{ json: { pdfUrl } }];
`.trim();

const parseEmployersCode = `
${sharedHelpers}

const item = $input.first().json;
const text = typeof item === 'string'
  ? item
  : (item.text || item.data || item.content || item.pdfText || '');
const staticData = $getWorkflowStaticData('global');
const sourceUrl = staticData.sb_pdf_url || FALLBACK_PDF;
const nowIso = new Date().toISOString();
const scraped = parseEmployersFromPdfText(String(text || ''), sourceUrl, nowIso);

let existing = [];
try { existing = $('Read Employers').all().map((i) => i.json); } catch (e) { existing = []; }

const { upserts, stale } = mergeUpserts(scraped, existing);
const rows = [...upserts, ...stale];
staticData.sb_employer_count = scraped.length;
staticData.sb_employer_upserts = upserts.length;
staticData.sb_employer_stale = stale.length;

if (!scraped.length) throw new Error('PDF text parsed to 0 employers — check Extract From File output field');
if (!rows.length) return [{ json: { _skip: true, message: 'No employer rows' } }];
return rows.map((r) => ({ json: r }));
`.trim();

const runLogCode = `
const staticData = $getWorkflowStaticData('global');
const started = staticData.sb_run_started || new Date().toISOString();
const finished = new Date().toISOString();
const nocs = staticData.sb_noc_count || 0;
const employers = staticData.sb_employer_count || 0;
const upserts = (staticData.sb_noc_upserts || 0) + (staticData.sb_employer_upserts || 0);
const stale = (staticData.sb_noc_stale || 0) + (staticData.sb_employer_stale || 0);
return [{
  json: {
    run_id: 'steinbach-' + started,
    started_at: started,
    finished_at: finished,
    community_id: 'steinbach',
    adapter: 'steinbach-html-nocs+pdf-employers',
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
  name: 'RCIP Steinbach — NOCs + Employers',
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
              triggerAtHour: 8,
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
        'Weekly Mon 08:00 America/Vancouver (after WK 06:00 and NOS 07:00). Keep Manual Run for ad-hoc.',
    },
    {
      parameters: {
        jsCode:
          "const s=$getWorkflowStaticData('global');\ns.sb_run_started=new Date().toISOString();\ns.sb_noc_count=0;s.sb_noc_upserts=0;s.sb_noc_stale=0;\ns.sb_employer_count=0;s.sb_employer_upserts=0;s.sb_employer_stale=0;s.sb_pdf_url='';s.sb_portal_html='';\nreturn [{json:{ok:true}}];",
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
        jsCode: 'return [{ json: { ready: true, existing_noc_rows: $input.all().length } }];',
      },
      id: 'collapse-after-noc-read',
      name: 'Collapse After NOC Read',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [560, 300],
    },
    {
      parameters: {
        url: 'https://steinbachedc.com/rcip/',
        sendHeaders: true,
        headerParameters: uaHeaders,
        options: {
          response: { response: { responseFormat: 'text' } },
          timeout: 30000,
        },
      },
      id: 'fetch-portal',
      name: 'Fetch Portal HTML',
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
        jsCode: 'await new Promise((r) => setTimeout(r, 3000));\nreturn [{ json: { delayed: true } }];',
      },
      id: 'delay-1',
      name: 'Crawl Delay 3s',
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
        jsCode: 'return [{ json: { ready: true, existing_employer_rows: $input.all().length } }];',
      },
      id: 'collapse-after-employer-read',
      name: 'Collapse After Employer Read',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1900, 300],
    },
    {
      parameters: { jsCode: findPdfCode },
      id: 'find-pdf',
      name: 'Find Employer List PDF',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2100, 300],
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
      position: [2320, 300],
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
      position: [2540, 300],
    },
    {
      parameters: { jsCode: parseEmployersCode },
      id: 'parse-employers',
      name: 'Parse + Merge Employers',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2760, 300],
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
      position: [2980, 300],
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
      position: [3200, 300],
      credentials: sheetsCred(),
    },
    {
      parameters: { mode: 'runOnceForAllItems', jsCode: runLogCode },
      id: 'build-run-log',
      name: 'Build Run Log',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [3420, 300],
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
      position: [3640, 300],
      credentials: sheetsCred(),
    },
  ],
  connections: {
    'Manual Run': { main: [[{ node: 'Init Run', type: 'main', index: 0 }]] },
    'Weekly Schedule': { main: [[{ node: 'Init Run', type: 'main', index: 0 }]] },
    'Init Run': { main: [[{ node: 'Read Priority NOCs', type: 'main', index: 0 }]] },
    'Read Priority NOCs': { main: [[{ node: 'Collapse After NOC Read', type: 'main', index: 0 }]] },
    'Collapse After NOC Read': { main: [[{ node: 'Fetch Portal HTML', type: 'main', index: 0 }]] },
    'Fetch Portal HTML': { main: [[{ node: 'Parse + Merge NOCs', type: 'main', index: 0 }]] },
    'Parse + Merge NOCs': { main: [[{ node: 'Has NOC Rows?', type: 'main', index: 0 }]] },
    'Has NOC Rows?': { main: [[{ node: 'Upsert Priority NOCs', type: 'main', index: 0 }]] },
    'Upsert Priority NOCs': { main: [[{ node: 'Crawl Delay 3s', type: 'main', index: 0 }]] },
    'Crawl Delay 3s': { main: [[{ node: 'Read Employers', type: 'main', index: 0 }]] },
    'Read Employers': { main: [[{ node: 'Collapse After Employer Read', type: 'main', index: 0 }]] },
    'Collapse After Employer Read': { main: [[{ node: 'Find Employer List PDF', type: 'main', index: 0 }]] },
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

const outPath = join(__dirname, '..', 'n8n', 'steinbach-scrape.workflow.json');
writeFileSync(outPath, JSON.stringify(workflow, null, 2));
console.log('Wrote', outPath);
