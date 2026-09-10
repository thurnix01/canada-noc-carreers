/**
 * Builds n8n/thunder-bay-scrape.workflow.json from Steinbach skeleton + parse-thunder-bay.mjs.
 * Run: node scripts/build-thunder-bay-n8n-workflow.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadSharedHelpers() {
  let src = readFileSync(join(root, 'scripts', 'parse-thunder-bay.mjs'), 'utf8');
  src = src.replace(/^import[\s\S]*?;\n/gm, '');
  src = src.replace(/^export /gm, '');
  src = src.replace(/\nasync function main[\s\S]*$/m, '\n');
  src = src.replace(/\nconst isDirect[\s\S]*$/m, '\n');
  src = src.replace(/\nconst NOC_HEADERS[\s\S]*?\];\n/m, '\n');
  src = src.replace(/\nconst EMPLOYER_HEADERS[\s\S]*?\];\n/m, '\n');
  src = src.replace(/\nfunction csvEscape[\s\S]*?\nfunction rowsToCsv[\s\S]*?\n\}\n/m, '\n');
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
staticData.tb_noc_count = scraped.length;
staticData.tb_noc_upserts = upserts.length;
staticData.tb_noc_stale = stale.length;
staticData.tb_run_started = staticData.tb_run_started || nowIso;
staticData.tb_portal_html = typeof html === 'string' ? html : String(html);

if (!rows.length) return [{ json: { _skip: true, message: 'No priority NOC rows' } }];
return rows.map((r) => ({ json: r }));
`.trim();

const findPdfCode = `
${sharedHelpers}

const staticData = $getWorkflowStaticData('global');
const html = staticData.tb_portal_html || '';
const pdfUrl = findEmployerListPdf(html);
if (!pdfUrl) throw new Error('Could not find Designated Employer PDF on Thunder Bay RCIP page');
staticData.tb_pdf_url = pdfUrl;
return [{ json: { pdfUrl } }];
`.trim();

const parseEmployersCode = `
${sharedHelpers}

const item = $input.first().json;
const text = typeof item === 'string'
  ? item
  : (item.text || item.data || item.content || item.pdfText || '');
const staticData = $getWorkflowStaticData('global');
const sourceUrl = staticData.tb_pdf_url || FALLBACK_PDF;
const nowIso = new Date().toISOString();
const scraped = parseEmployersFromPdfText(String(text || ''), sourceUrl, nowIso);

let existing = [];
try { existing = $('Read Employers').all().map((i) => i.json); } catch (e) { existing = []; }

const { upserts, stale } = mergeUpserts(scraped, existing);
const rows = [...upserts, ...stale];
staticData.tb_employer_count = scraped.length;
staticData.tb_employer_upserts = upserts.length;
staticData.tb_employer_stale = stale.length;

if (!scraped.length) throw new Error('PDF text parsed to 0 employers — check Extract From File output field');
if (!rows.length) return [{ json: { _skip: true, message: 'No employer rows' } }];
return rows.map((r) => ({ json: r }));
`.trim();

const runLogCode = `
const staticData = $getWorkflowStaticData('global');
const started = staticData.tb_run_started || new Date().toISOString();
const finished = new Date().toISOString();
const upserts = (staticData.tb_noc_upserts || 0) + (staticData.tb_employer_upserts || 0);
const stale = (staticData.tb_noc_stale || 0) + (staticData.tb_employer_stale || 0);
return [{
  json: {
    run_id: 'thunder-bay-' + started,
    started_at: started,
    finished_at: finished,
    community_id: 'thunder-bay',
    adapter: 'thunder-bay-html-nocs+pdf-employers',
    rows_upserted: String(upserts),
    rows_stale: String(stale),
    errors: '',
    ok: 'TRUE',
  },
}];
`.trim();

const workflow = JSON.parse(readFileSync(join(root, 'n8n', 'steinbach-scrape.workflow.json'), 'utf8'));
workflow.name = 'RCIP Thunder Bay — NOCs + Employers';

for (const node of workflow.nodes) {
  if (node.name === 'Weekly Schedule') {
    node.parameters.rule.interval[0].triggerAtHour = 11;
    node.notes =
      'Weekly Mon 11:00 America/Vancouver (after WK/NOS/Steinbach/Timmins/North Bay). Keep Manual Run for ad-hoc.';
  }
  if (node.name === 'Init Run') {
    node.parameters.jsCode =
      "const s=$getWorkflowStaticData('global');\ns.tb_run_started=new Date().toISOString();\ns.tb_noc_count=0;s.tb_noc_upserts=0;s.tb_noc_stale=0;\ns.tb_employer_count=0;s.tb_employer_upserts=0;s.tb_employer_stale=0;s.tb_pdf_url='';s.tb_portal_html='';\nreturn [{json:{ok:true}}];";
  }
  if (node.name === 'Fetch Portal HTML') {
    node.parameters.url = 'https://gotothunderbay.ca/rural-community-immigration-pilot-rcip/';
  }
  if (node.name === 'Parse + Merge NOCs') node.parameters.jsCode = parseNocsCode;
  if (node.name === 'Find Employer List PDF') node.parameters.jsCode = findPdfCode;
  if (node.name === 'Parse + Merge Employers') node.parameters.jsCode = parseEmployersCode;
  if (node.name === 'Build Run Log') node.parameters.jsCode = runLogCode;
}

const outPath = join(root, 'n8n', 'thunder-bay-scrape.workflow.json');
writeFileSync(outPath, JSON.stringify(workflow, null, 2));
console.log('Wrote', outPath);
