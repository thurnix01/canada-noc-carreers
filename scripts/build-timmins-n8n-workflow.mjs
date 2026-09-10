/**
 * Builds n8n/timmins-scrape.workflow.json from the Steinbach skeleton + parse-timmins.mjs helpers.
 * Run: node scripts/build-timmins-n8n-workflow.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadSharedHelpers() {
  let src = readFileSync(join(root, 'scripts', 'parse-timmins.mjs'), 'utf8');
  src = src.replace(/^import[\s\S]*?;\n/gm, '');
  src = src.replace(/^export /gm, '');
  src = src.replace(/\nasync function main[\s\S]*$/m, '\n');
  src = src.replace(/\nconst isDirect[\s\S]*$/m, '\n');
  src = src.replace(/\nconst NOC_HEADERS[\s\S]*?^const EMPLOYER_HEADERS[\s\S]*?\];\n/m, '\n');
  // Drop CSV helpers unused in n8n
  src = src.replace(/\nfunction csvEscape[\s\S]*?\nfunction rowsToCsv[\s\S]*?\n\}\n/m, '\n');
  src = src.replace(/\nimport[\s\S]*?\n/g, '\n');
  return src.trim();
}

const sharedHelpers = loadSharedHelpers();

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
staticData.tm_noc_count = scraped.length;
staticData.tm_noc_upserts = upserts.length;
staticData.tm_noc_stale = stale.length;
staticData.tm_run_started = staticData.tm_run_started || nowIso;
staticData.tm_portal_html = typeof html === 'string' ? html : String(html);

if (!rows.length) return [{ json: { _skip: true, message: 'No priority NOC rows' } }];
return rows.map((r) => ({ json: r }));
`.trim();

const findPdfCode = `
${sharedHelpers}

const staticData = $getWorkflowStaticData('global');
const html = staticData.tm_portal_html || '';
const pdfUrl = findEmployerListPdf(html);
if (!pdfUrl) throw new Error('Could not find Designated Employers PDF on Timmins immigration page');
staticData.tm_pdf_url = pdfUrl;
return [{ json: { pdfUrl } }];
`.trim();

const parseEmployersCode = `
${sharedHelpers}

const item = $input.first().json;
const text = typeof item === 'string'
  ? item
  : (item.text || item.data || item.content || item.pdfText || '');
const staticData = $getWorkflowStaticData('global');
const sourceUrl = staticData.tm_pdf_url || FALLBACK_PDF;
const nowIso = new Date().toISOString();
const scraped = parseEmployersFromPdfText(String(text || ''), sourceUrl, nowIso);

let existing = [];
try { existing = $('Read Employers').all().map((i) => i.json); } catch (e) { existing = []; }

const { upserts, stale } = mergeUpserts(scraped, existing);
const rows = [...upserts, ...stale];
staticData.tm_employer_count = scraped.length;
staticData.tm_employer_upserts = upserts.length;
staticData.tm_employer_stale = stale.length;

if (!scraped.length) throw new Error('PDF text parsed to 0 employers — check Extract From File output field');
if (!rows.length) return [{ json: { _skip: true, message: 'No employer rows' } }];
return rows.map((r) => ({ json: r }));
`.trim();

const runLogCode = `
const staticData = $getWorkflowStaticData('global');
const started = staticData.tm_run_started || new Date().toISOString();
const finished = new Date().toISOString();
const upserts = (staticData.tm_noc_upserts || 0) + (staticData.tm_employer_upserts || 0);
const stale = (staticData.tm_noc_stale || 0) + (staticData.tm_employer_stale || 0);
return [{
  json: {
    run_id: 'timmins-' + started,
    started_at: started,
    finished_at: finished,
    community_id: 'timmins',
    adapter: 'timmins-html-nocs+pdf-employers',
    rows_upserted: String(upserts),
    rows_stale: String(stale),
    errors: '',
    ok: 'TRUE',
  },
}];
`.trim();

const workflow = JSON.parse(readFileSync(join(root, 'n8n', 'steinbach-scrape.workflow.json'), 'utf8'));
workflow.name = 'RCIP Timmins — NOCs + Employers';

for (const node of workflow.nodes) {
  if (node.name === 'Weekly Schedule') {
    node.parameters.rule.interval[0].triggerAtHour = 9;
    node.notes =
      'Weekly Mon 09:00 America/Vancouver (after WK 06:00 / NOS 07:00 / Steinbach 08:00). Keep Manual Run for ad-hoc.';
  }
  if (node.name === 'Init Run') {
    node.parameters.jsCode =
      "const s=$getWorkflowStaticData('global');\ns.tm_run_started=new Date().toISOString();\ns.tm_noc_count=0;s.tm_noc_upserts=0;s.tm_noc_stale=0;\ns.tm_employer_count=0;s.tm_employer_upserts=0;s.tm_employer_stale=0;s.tm_pdf_url='';s.tm_portal_html='';\nreturn [{json:{ok:true}}];";
  }
  if (node.name === 'Fetch Portal HTML') {
    node.parameters.url = 'https://timminsedc.com/immigration/';
  }
  if (node.name === 'Parse + Merge NOCs') node.parameters.jsCode = parseNocsCode;
  if (node.name === 'Find Employer List PDF') node.parameters.jsCode = findPdfCode;
  if (node.name === 'Parse + Merge Employers') node.parameters.jsCode = parseEmployersCode;
  if (node.name === 'Build Run Log') node.parameters.jsCode = runLogCode;
}

const outPath = join(root, 'n8n', 'timmins-scrape.workflow.json');
writeFileSync(outPath, JSON.stringify(workflow, null, 2));
console.log('Wrote', outPath);
