/**
 * Builds n8n workflows for remaining RCIP communities from Steinbach skeleton.
 * Usage: node scripts/build-remaining-n8n-workflows.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const skeleton = JSON.parse(readFileSync(join(root, 'n8n', 'steinbach-scrape.workflow.json'), 'utf8'));

const UA = 'RCIPAggregatorBot/0.1 (+mailto:absolondesigns@gmail.com)';

function loadHelpers(parseFile) {
  let src = readFileSync(join(root, 'scripts', parseFile), 'utf8');
  src = src.replace(/^import[\s\S]*?;\n/gm, '');
  src = src.replace(/^export /gm, '');
  src = src.replace(/\nasync function main[\s\S]*$/m, '\n');
  src = src.replace(/\nconst isDirect[\s\S]*$/m, '\n');
  src = src.replace(/\nconst NOC_HEADERS[\s\S]*?\];\n/m, '\n');
  src = src.replace(/\nconst EMPLOYER_HEADERS[\s\S]*?\];\n/m, '\n');
  src = src.replace(/\nfunction csvEscape[\s\S]*?\nfunction rowsToCsv[\s\S]*?\n\}\n/m, '\n');
  src = src.replace(/\nasync function fetchPage[\s\S]*?\n\}\n/m, '\n');
  return src.trim();
}

function prefix(id) {
  return id
    .split('-')
    .map((p) => p[0])
    .join('')
    .slice(0, 4);
}

function httpTextNode(id, name, url, position, { allowUnauthorizedCerts = false } = {}) {
  return {
    parameters: {
      url,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'User-Agent', value: UA },
          { name: 'Accept', value: 'text/html,application/xhtml+xml,application/json,application/pdf' },
        ],
      },
      options: {
        response: { response: { responseFormat: 'text' } },
        timeout: 30000,
        ...(allowUnauthorizedCerts ? { allowUnauthorizedCerts: true } : {}),
      },
    },
    id,
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position,
  };
}

function buildPdfWorkflow(cfg) {
  const helpers = loadHelpers(cfg.parseFile);
  const p = prefix(cfg.id);
  const workflow = structuredClone(skeleton);
  workflow.name = cfg.workflowName;

  const parseNocsCode = `
${helpers}

const raw = $input.first().json;
const html = typeof raw === 'string' ? raw : (raw.data || raw.body || '');
const nowIso = new Date().toISOString();
const scraped = parsePriorityNocs(typeof html === 'string' ? html : String(html), nowIso);

let existing = [];
try { existing = $('Read Priority NOCs').all().map((i) => i.json); } catch (e) { existing = []; }

const { upserts, stale } = mergeUpserts(scraped, existing);
const rows = [...upserts, ...stale];
const staticData = $getWorkflowStaticData('global');
staticData.${p}_noc_count = scraped.length;
staticData.${p}_noc_upserts = upserts.length;
staticData.${p}_noc_stale = stale.length;
staticData.${p}_run_started = staticData.${p}_run_started || nowIso;
staticData.${p}_portal_html = typeof html === 'string' ? html : String(html);

if (!rows.length) return [{ json: { _skip: true, message: 'No priority NOC rows' } }];
return rows.map((r) => ({ json: r }));
`.trim();

  const findPdfCode = cfg.pdfHtmlFromStatic
    ? `
${helpers}

const staticData = $getWorkflowStaticData('global');
const html = staticData.${p}_pdf_page_html || staticData.${p}_portal_html || '';
const pdfUrl = findEmployerListPdf(html);
if (!pdfUrl) throw new Error('Could not find Designated Employer PDF for ${cfg.id}');
staticData.${p}_pdf_url = pdfUrl;
return [{ json: { pdfUrl } }];
`.trim()
    : `
${helpers}

const raw = $input.first().json;
const html = typeof raw === 'string' ? raw : (raw.data || raw.body || '');
const staticData = $getWorkflowStaticData('global');
staticData.${p}_pdf_page_html = typeof html === 'string' ? html : String(html);
const pdfUrl = findEmployerListPdf(staticData.${p}_pdf_page_html);
if (!pdfUrl) throw new Error('Could not find Designated Employer PDF for ${cfg.id}');
staticData.${p}_pdf_url = pdfUrl;
return [{ json: { pdfUrl } }];
`.trim();

  const parseEmployersCode = `
${helpers}

const item = $input.first().json;
const text = typeof item === 'string'
  ? item
  : (item.text || item.data || item.content || item.pdfText || '');
const staticData = $getWorkflowStaticData('global');
const sourceUrl = staticData.${p}_pdf_url || (typeof FALLBACK_PDF !== 'undefined' ? FALLBACK_PDF : '');
const nowIso = new Date().toISOString();
const scraped = parseEmployersFromPdfText(String(text || ''), sourceUrl, nowIso);

let existing = [];
try { existing = $('Read Employers').all().map((i) => i.json); } catch (e) { existing = []; }

const { upserts, stale } = mergeUpserts(scraped, existing);
const rows = [...upserts, ...stale];
staticData.${p}_employer_count = scraped.length;
staticData.${p}_employer_upserts = upserts.length;
staticData.${p}_employer_stale = stale.length;

if (!scraped.length) throw new Error('PDF text parsed to 0 employers — check Extract From File output field');
if (!rows.length) return [{ json: { _skip: true, message: 'No employer rows' } }];
return rows.map((r) => ({ json: r }));
`.trim();

  const runLogCode = `
const staticData = $getWorkflowStaticData('global');
const started = staticData.${p}_run_started || new Date().toISOString();
const finished = new Date().toISOString();
const upserts = (staticData.${p}_noc_upserts || 0) + (staticData.${p}_employer_upserts || 0);
const stale = (staticData.${p}_noc_stale || 0) + (staticData.${p}_employer_stale || 0);
return [{
  json: {
    run_id: '${cfg.id}-' + started,
    started_at: started,
    finished_at: finished,
    community_id: '${cfg.id}',
    adapter: '${cfg.adapter}',
    rows_upserted: String(upserts),
    rows_stale: String(stale),
    errors: '',
    ok: 'TRUE',
  },
}];
`.trim();

  for (const node of workflow.nodes) {
    if (node.name === 'Weekly Schedule') {
      node.parameters.rule.interval[0].triggerAtHour = cfg.hour;
      node.notes = `Weekly Mon ${String(cfg.hour).padStart(2, '0')}:00 America/Vancouver. Keep Manual Run for ad-hoc.`;
    }
    if (node.name === 'Init Run') {
      node.parameters.jsCode = `const s=$getWorkflowStaticData('global');\ns.${p}_run_started=new Date().toISOString();\ns.${p}_noc_count=0;s.${p}_noc_upserts=0;s.${p}_noc_stale=0;\ns.${p}_employer_count=0;s.${p}_employer_upserts=0;s.${p}_employer_stale=0;s.${p}_pdf_url='';s.${p}_portal_html='';s.${p}_pdf_page_html='';\nreturn [{json:{ok:true}}];`;
    }
    if (node.name === 'Fetch Portal HTML') {
      node.parameters.url = cfg.nocUrl;
      if (cfg.allowUnauthorizedCerts) {
        node.parameters.options = {
          ...(node.parameters.options || {}),
          allowUnauthorizedCerts: true,
        };
      }
    }
    if (node.name === 'Parse + Merge NOCs') node.parameters.jsCode = parseNocsCode;
    if (node.name === 'Find Employer List PDF') node.parameters.jsCode = findPdfCode;
    if (node.name === 'Parse + Merge Employers') node.parameters.jsCode = parseEmployersCode;
    if (node.name === 'Build Run Log') node.parameters.jsCode = runLogCode;
    if (cfg.allowUnauthorizedCerts && node.type === 'n8n-nodes-base.httpRequest') {
      node.parameters.options = {
        ...(node.parameters.options || {}),
        allowUnauthorizedCerts: true,
      };
    }
  }

  // For communities that need a separate page to discover the PDF link
  if (cfg.pdfPageUrl) {
    const findIdx = workflow.nodes.findIndex((n) => n.name === 'Find Employer List PDF');
    const fetchPdfPage = httpTextNode(
      `${cfg.id}-fetch-pdf-page`,
      'Fetch PDF Index HTML',
      cfg.pdfPageUrl,
      [2000, 300],
      { allowUnauthorizedCerts: !!cfg.allowUnauthorizedCerts },
    );
    workflow.nodes.splice(findIdx, 0, fetchPdfPage);
    // rewire: Collapse After Employer Read -> Fetch PDF Index HTML -> Find Employer List PDF
    workflow.connections['Collapse After Employer Read'] = {
      main: [[{ node: 'Fetch PDF Index HTML', type: 'main', index: 0 }]],
    };
    workflow.connections['Fetch PDF Index HTML'] = {
      main: [[{ node: 'Find Employer List PDF', type: 'main', index: 0 }]],
    };
  }

  const outPath = join(root, 'n8n', `${cfg.id}-scrape.workflow.json`);
  writeFileSync(outPath, JSON.stringify(workflow, null, 2));
  console.log('Wrote', outPath);
}

function buildHtmlWorkflow(cfg) {
  const helpers = loadHelpers(cfg.parseFile);
  const p = prefix(cfg.id);
  const workflow = structuredClone(skeleton);
  workflow.name = cfg.workflowName;

  const parseNocsCode = `
${helpers}

const raw = $input.first().json;
const html = typeof raw === 'string' ? raw : (raw.data || raw.body || '');
const nowIso = new Date().toISOString();
const scraped = parsePriorityNocs(typeof html === 'string' ? html : String(html), nowIso);

let existing = [];
try { existing = $('Read Priority NOCs').all().map((i) => i.json); } catch (e) { existing = []; }

const { upserts, stale } = mergeUpserts(scraped, existing);
const rows = [...upserts, ...stale];
const staticData = $getWorkflowStaticData('global');
staticData.${p}_noc_count = scraped.length;
staticData.${p}_noc_upserts = upserts.length;
staticData.${p}_noc_stale = stale.length;
staticData.${p}_run_started = staticData.${p}_run_started || nowIso;
staticData.${p}_portal_html = typeof html === 'string' ? html : String(html);

if (!rows.length) return [{ json: { _skip: true, message: 'No priority NOC rows' } }];
return rows.map((r) => ({ json: r }));
`.trim();

  const employerParseFn = cfg.employerParseFn || 'parseEmployers';
  const parseEmployersCode = cfg.samePageForEmployers
    ? `
${helpers}

const staticData = $getWorkflowStaticData('global');
const html = staticData.${p}_portal_html || '';
const nowIso = new Date().toISOString();
const scraped = ${employerParseFn}(String(html || ''), nowIso);

let existing = [];
try { existing = $('Read Employers').all().map((i) => i.json); } catch (e) { existing = []; }

const { upserts, stale } = mergeUpserts(scraped, existing);
const rows = [...upserts, ...stale];
staticData.${p}_employer_count = scraped.length;
staticData.${p}_employer_upserts = upserts.length;
staticData.${p}_employer_stale = stale.length;

if (!scraped.length) throw new Error('HTML parsed to 0 employers');
if (!rows.length) return [{ json: { _skip: true, message: 'No employer rows' } }];
return rows.map((r) => ({ json: r }));
`.trim()
    : cfg.employersFromJson
      ? `
${helpers}

const raw = $input.first().json;
let rendered = '';
if (Array.isArray(raw)) rendered = raw[0]?.content?.rendered || '';
else if (typeof raw === 'string') {
  try { const parsed = JSON.parse(raw); rendered = parsed?.[0]?.content?.rendered || ''; }
  catch (e) { rendered = raw; }
} else {
  rendered = raw?.content?.rendered || raw?.data?.[0]?.content?.rendered || raw?.body || '';
  if (!rendered && typeof raw.data === 'string') {
    try { const parsed = JSON.parse(raw.data); rendered = parsed?.[0]?.content?.rendered || ''; }
    catch (e) { rendered = raw.data; }
  }
}
const nowIso = new Date().toISOString();
const scraped = ${employerParseFn}(String(rendered || ''), nowIso);

let existing = [];
try { existing = $('Read Employers').all().map((i) => i.json); } catch (e) { existing = []; }

const { upserts, stale } = mergeUpserts(scraped, existing);
const rows = [...upserts, ...stale];
const staticData = $getWorkflowStaticData('global');
staticData.${p}_employer_count = scraped.length;
staticData.${p}_employer_upserts = upserts.length;
staticData.${p}_employer_stale = stale.length;

if (!scraped.length) throw new Error('Employer HTML/JSON parsed to 0 employers');
if (!rows.length) return [{ json: { _skip: true, message: 'No employer rows' } }];
return rows.map((r) => ({ json: r }));
`.trim()
      : `
${helpers}

const raw = $input.first().json;
const html = typeof raw === 'string' ? raw : (raw.data || raw.body || '');
const nowIso = new Date().toISOString();
const scraped = ${employerParseFn}(typeof html === 'string' ? html : String(html), nowIso);

let existing = [];
try { existing = $('Read Employers').all().map((i) => i.json); } catch (e) { existing = []; }

const { upserts, stale } = mergeUpserts(scraped, existing);
const rows = [...upserts, ...stale];
const staticData = $getWorkflowStaticData('global');
staticData.${p}_employer_count = scraped.length;
staticData.${p}_employer_upserts = upserts.length;
staticData.${p}_employer_stale = stale.length;

if (!scraped.length) throw new Error('HTML parsed to 0 employers');
if (!rows.length) return [{ json: { _skip: true, message: 'No employer rows' } }];
return rows.map((r) => ({ json: r }));
`.trim();

  const runLogCode = `
const staticData = $getWorkflowStaticData('global');
const started = staticData.${p}_run_started || new Date().toISOString();
const finished = new Date().toISOString();
const upserts = (staticData.${p}_noc_upserts || 0) + (staticData.${p}_employer_upserts || 0);
const stale = (staticData.${p}_noc_stale || 0) + (staticData.${p}_employer_stale || 0);
return [{
  json: {
    run_id: '${cfg.id}-' + started,
    started_at: started,
    finished_at: finished,
    community_id: '${cfg.id}',
    adapter: '${cfg.adapter}',
    rows_upserted: String(upserts),
    rows_stale: String(stale),
    errors: '',
    ok: 'TRUE',
  },
}];
`.trim();

  // Remove PDF-specific nodes; insert Fetch Employers HTML (or reuse static)
  workflow.nodes = workflow.nodes.filter(
    (n) =>
      ![
        'Find Employer List PDF',
        'Download Employer PDF',
        'Extract PDF Text',
      ].includes(n.name),
  );

  if (!cfg.samePageForEmployers) {
    workflow.nodes.push(
      httpTextNode(
        `${cfg.id}-fetch-employers`,
        'Fetch Employers HTML',
        cfg.employersUrl,
        [2100, 300],
        { allowUnauthorizedCerts: !!cfg.allowUnauthorizedCerts },
      ),
    );
  } else {
    workflow.nodes.push({
      parameters: {
        jsCode: `const s=$getWorkflowStaticData('global');\nreturn [{ json: { html: s.${p}_portal_html || '', ready: true } }];`,
      },
      id: `${cfg.id}-reuse-portal`,
      name: 'Reuse Portal HTML',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2100, 300],
    });
  }

  for (const node of workflow.nodes) {
    if (node.name === 'Weekly Schedule') {
      node.parameters.rule.interval[0].triggerAtHour = cfg.hour;
      node.notes = `Weekly Mon ${String(cfg.hour).padStart(2, '0')}:00 America/Vancouver. Keep Manual Run for ad-hoc.`;
    }
    if (node.name === 'Init Run') {
      node.parameters.jsCode = `const s=$getWorkflowStaticData('global');\ns.${p}_run_started=new Date().toISOString();\ns.${p}_noc_count=0;s.${p}_noc_upserts=0;s.${p}_noc_stale=0;\ns.${p}_employer_count=0;s.${p}_employer_upserts=0;s.${p}_employer_stale=0;s.${p}_portal_html='';\nreturn [{json:{ok:true}}];`;
    }
    if (node.name === 'Fetch Portal HTML') {
      node.parameters.url = cfg.nocUrl;
      if (cfg.allowUnauthorizedCerts) {
        node.parameters.options = {
          ...(node.parameters.options || {}),
          allowUnauthorizedCerts: true,
        };
      }
    }
    if (node.name === 'Parse + Merge NOCs') node.parameters.jsCode = parseNocsCode;
    if (node.name === 'Parse + Merge Employers') {
      node.parameters.jsCode = parseEmployersCode;
      node.position = [2320, 300];
    }
    if (node.name === 'Build Run Log') node.parameters.jsCode = runLogCode;
    if (cfg.allowUnauthorizedCerts && node.type === 'n8n-nodes-base.httpRequest') {
      node.parameters.options = {
        ...(node.parameters.options || {}),
        allowUnauthorizedCerts: true,
      };
    }
  }

  const employerSourceNode = cfg.samePageForEmployers ? 'Reuse Portal HTML' : 'Fetch Employers HTML';
  workflow.connections['Collapse After Employer Read'] = {
    main: [[{ node: employerSourceNode, type: 'main', index: 0 }]],
  };
  workflow.connections[employerSourceNode] = {
    main: [[{ node: 'Parse + Merge Employers', type: 'main', index: 0 }]],
  };
  workflow.connections['Parse + Merge Employers'] = {
    main: [[{ node: 'Has Employer Rows?', type: 'main', index: 0 }]],
  };
  // remove old PDF connections if present
  delete workflow.connections['Find Employer List PDF'];
  delete workflow.connections['Download Employer PDF'];
  delete workflow.connections['Extract PDF Text'];

  const outPath = join(root, 'n8n', `${cfg.id}-scrape.workflow.json`);
  writeFileSync(outPath, JSON.stringify(workflow, null, 2));
  console.log('Wrote', outPath);
}

const configs = [
  {
    mode: 'pdf',
    id: 'pictou-county',
    workflowName: 'RCIP Pictou County — NOCs + Employers',
    parseFile: 'parse-pictou-county.mjs',
    nocUrl: 'https://pcrcip.ca/',
    pdfPageUrl: 'https://pcrcip.ca/employers/',
    hour: 12,
    adapter: 'pictou-html-nocs+pdf-employers',
  },
  {
    mode: 'html',
    id: 'sudbury',
    workflowName: 'RCIP Sudbury — NOCs + Employers',
    parseFile: 'parse-sudbury.mjs',
    nocUrl: 'https://investsudbury.ca/why-sudbury/newcomers/rcipfcip/',
    samePageForEmployers: true,
    hour: 13,
    adapter: 'sudbury-html-nocs+html-employers',
  },
  {
    mode: 'html',
    id: 'sault-ste-marie',
    workflowName: 'RCIP Sault Ste. Marie — NOCs + Employers',
    parseFile: 'parse-sault-ste-marie.mjs',
    nocUrl: 'https://welcometossm.com/rcip_employer/',
    employersUrl: 'https://welcometossm.com/wp-json/wp/v2/pages?slug=designated-employers',
    employersFromJson: true,
    employerParseFn: 'parseEmployersFromRendered',
    hour: 14,
    adapter: 'sault-html-nocs+wpjson-employers',
  },
  {
    mode: 'html',
    id: 'altona-rhineland',
    workflowName: 'RCIP Altona/Rhineland — NOCs + Employers',
    parseFile: 'parse-altona-rhineland.mjs',
    nocUrl: 'https://ared-rpga.com/immigration/rcip-sector/',
    employersUrl: 'https://ared-rpga.com/immigration/rcip-employers/',
    hour: 15,
    adapter: 'altona-html-nocs+html-employers',
  },
  {
    mode: 'html',
    id: 'brandon',
    workflowName: 'RCIP Brandon — NOCs + Employers',
    parseFile: 'parse-brandon.mjs',
    nocUrl: 'https://economicdevelopmentbrandon.com/rcip/rcip-sector-labour-market-priorities-list',
    employersUrl: 'https://economicdevelopmentbrandon.com/rcip/rcip-list-of-designated-employers',
    hour: 16,
    adapter: 'brandon-html-nocs+html-employers',
    // Site presents an incomplete TLS chain; local parser already uses rejectUnauthorized:false.
    allowUnauthorizedCerts: true,
  },
  {
    mode: 'pdf',
    id: 'moose-jaw',
    workflowName: 'RCIP Moose Jaw — NOCs + Employers',
    parseFile: 'parse-moose-jaw.mjs',
    nocUrl: 'https://rcip.mjchamber.com/employers/',
    pdfPageUrl: 'https://rcip.mjchamber.com/candidates/',
    hour: 17,
    adapter: 'moose-jaw-html-nocs+pdf-employers',
  },
  {
    mode: 'html',
    id: 'claresholm',
    workflowName: 'RCIP Claresholm — NOCs + Employers',
    parseFile: 'parse-claresholm.mjs',
    nocUrl:
      'https://www.claresholm.ca/business/labour-resources/rural-community-immigration-pilot',
    samePageForEmployers: true,
    hour: 18,
    adapter: 'claresholm-html-nocs+html-employers',
  },
];

for (const cfg of configs) {
  if (cfg.mode === 'pdf') buildPdfWorkflow(cfg);
  else buildHtmlWorkflow(cfg);
}

console.log('Done:', configs.length, 'workflows');
