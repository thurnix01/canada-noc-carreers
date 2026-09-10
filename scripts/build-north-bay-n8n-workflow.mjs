/**
 * Builds n8n/north-bay-scrape.workflow.json from Steinbach skeleton + parse-north-bay.mjs.
 * Run: node scripts/build-north-bay-n8n-workflow.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadSharedHelpers() {
  let src = readFileSync(join(root, 'scripts', 'parse-north-bay.mjs'), 'utf8');
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
staticData.nb_noc_count = scraped.length;
staticData.nb_noc_upserts = upserts.length;
staticData.nb_noc_stale = stale.length;
staticData.nb_run_started = staticData.nb_run_started || nowIso;

if (!rows.length) return [{ json: { _skip: true, message: 'No priority NOC rows' } }];
return rows.map((r) => ({ json: r }));
`.trim();

const parseEmployersCode = `
${sharedHelpers}

const raw = $input.first().json;
const data = Array.isArray(raw) ? raw : (raw.data || raw.body || raw);
const nowIso = new Date().toISOString();
const scraped = parseEmployersFromApi(data, nowIso);

let existing = [];
try { existing = $('Read Employers').all().map((i) => i.json); } catch (e) { existing = []; }

const { upserts, stale } = mergeUpserts(scraped, existing);
const rows = [...upserts, ...stale];
const staticData = $getWorkflowStaticData('global');
staticData.nb_employer_count = scraped.length;
staticData.nb_employer_upserts = upserts.length;
staticData.nb_employer_stale = stale.length;

if (!scraped.length) throw new Error('Employers API returned 0 rows');
if (!rows.length) return [{ json: { _skip: true, message: 'No employer rows' } }];
return rows.map((r) => ({ json: r }));
`.trim();

const runLogCode = `
const staticData = $getWorkflowStaticData('global');
const started = staticData.nb_run_started || new Date().toISOString();
const finished = new Date().toISOString();
const upserts = (staticData.nb_noc_upserts || 0) + (staticData.nb_employer_upserts || 0);
const stale = (staticData.nb_noc_stale || 0) + (staticData.nb_employer_stale || 0);
return [{
  json: {
    run_id: 'north-bay-' + started,
    started_at: started,
    finished_at: finished,
    community_id: 'north-bay',
    adapter: 'north-bay-html-nocs+monday-api-employers',
    rows_upserted: String(upserts),
    rows_stale: String(stale),
    errors: '',
    ok: 'TRUE',
  },
}];
`.trim();

const workflow = JSON.parse(readFileSync(join(root, 'n8n', 'steinbach-scrape.workflow.json'), 'utf8'));
workflow.name = 'RCIP North Bay — NOCs + Employers';

// Remove PDF-specific nodes; replace employer path with JSON API fetch
const removeNames = new Set([
  'Find Employer List PDF',
  'Download Employer PDF',
  'Extract PDF Text',
]);
workflow.nodes = workflow.nodes.filter((n) => !removeNames.has(n.name));

for (const node of workflow.nodes) {
  if (node.name === 'Weekly Schedule') {
    node.parameters.rule.interval[0].triggerAtHour = 10;
    node.notes =
      'Weekly Mon 10:00 America/Vancouver (after WK/NOS/Steinbach/Timmins). Keep Manual Run for ad-hoc.';
  }
  if (node.name === 'Init Run') {
    node.parameters.jsCode =
      "const s=$getWorkflowStaticData('global');\ns.nb_run_started=new Date().toISOString();\ns.nb_noc_count=0;s.nb_noc_upserts=0;s.nb_noc_stale=0;\ns.nb_employer_count=0;s.nb_employer_upserts=0;s.nb_employer_stale=0;\nreturn [{json:{ok:true}}];";
  }
  if (node.name === 'Fetch Portal HTML') {
    node.name = 'Fetch Employers HTML';
    node.parameters.url = 'https://nbrcip.ca/employers/';
  }
  if (node.name === 'Parse + Merge NOCs') node.parameters.jsCode = parseNocsCode;
  if (node.name === 'Parse + Merge Employers') node.parameters.jsCode = parseEmployersCode;
  if (node.name === 'Build Run Log') node.parameters.jsCode = runLogCode;
}

// Insert Fetch Employers API after Collapse After Employer Read
const collapse = workflow.nodes.find((n) => n.name === 'Collapse After Employer Read');
const parseEmp = workflow.nodes.find((n) => n.name === 'Parse + Merge Employers');
const fetchApi = {
  parameters: {
    url: 'https://nbrcip.ca/wp-admin/admin-ajax.php?action=load_monday_data',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'User-Agent', value: 'RCIPAggregatorBot/0.1 (+mailto:absolondesigns@gmail.com)' },
        { name: 'Accept', value: 'application/json' },
      ],
    },
    options: {
      response: { response: { responseFormat: 'json' } },
      timeout: 30000,
    },
  },
  id: 'fetch-employers-api',
  name: 'Fetch Employers API',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [2100, 300],
};

workflow.nodes.push(fetchApi);
// Shift parse employers position
if (parseEmp) parseEmp.position = [2320, 300];

workflow.connections = {
  'Manual Run': { main: [[{ node: 'Init Run', type: 'main', index: 0 }]] },
  'Weekly Schedule': { main: [[{ node: 'Init Run', type: 'main', index: 0 }]] },
  'Init Run': { main: [[{ node: 'Read Priority NOCs', type: 'main', index: 0 }]] },
  'Read Priority NOCs': { main: [[{ node: 'Collapse After NOC Read', type: 'main', index: 0 }]] },
  'Collapse After NOC Read': { main: [[{ node: 'Fetch Employers HTML', type: 'main', index: 0 }]] },
  'Fetch Employers HTML': { main: [[{ node: 'Parse + Merge NOCs', type: 'main', index: 0 }]] },
  'Parse + Merge NOCs': { main: [[{ node: 'Has NOC Rows?', type: 'main', index: 0 }]] },
  'Has NOC Rows?': { main: [[{ node: 'Upsert Priority NOCs', type: 'main', index: 0 }]] },
  'Upsert Priority NOCs': { main: [[{ node: 'Crawl Delay 3s', type: 'main', index: 0 }]] },
  'Crawl Delay 3s': { main: [[{ node: 'Read Employers', type: 'main', index: 0 }]] },
  'Read Employers': { main: [[{ node: 'Collapse After Employer Read', type: 'main', index: 0 }]] },
  'Collapse After Employer Read': { main: [[{ node: 'Fetch Employers API', type: 'main', index: 0 }]] },
  'Fetch Employers API': { main: [[{ node: 'Parse + Merge Employers', type: 'main', index: 0 }]] },
  'Parse + Merge Employers': { main: [[{ node: 'Has Employer Rows?', type: 'main', index: 0 }]] },
  'Has Employer Rows?': { main: [[{ node: 'Upsert Employers', type: 'main', index: 0 }]] },
  'Upsert Employers': { main: [[{ node: 'Build Run Log', type: 'main', index: 0 }]] },
  'Build Run Log': { main: [[{ node: 'Append Run Log', type: 'main', index: 0 }]] },
};

const outPath = join(root, 'n8n', 'north-bay-scrape.workflow.json');
writeFileSync(outPath, JSON.stringify(workflow, null, 2));
console.log('Wrote', outPath);
