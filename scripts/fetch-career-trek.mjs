/**
 * Refresh Career Trek NOC → video map for BC RCIP priority NOCs.
 * Usage: node scripts/fetch-career-trek.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const listingsPath = join(__dirname, '..', 'web', 'public', 'data', 'listings.json')
const outPaths = [
  join(__dirname, '..', 'web', 'public', 'data', 'career-trek.json'),
  join(__dirname, '..', 'web', 'src', 'data', 'career-trek.json'),
]

const listings = JSON.parse(readFileSync(listingsPath, 'utf8'))
const bcNocs = [
  ...new Set(
    listings.listings
      .filter((l) => l.type === 'priority_noc' && l.province === 'BC')
      .map((l) => String(l.noc_code || '').replace(/\D/g, '')),
  ),
]
  .filter((n) => n.length === 5)
  .sort()

console.log(`Checking Career Trek for ${bcNocs.length} BC NOCs…`)

async function lookup(noc) {
  const u = `https://www.workbc.ca/plan-career/career-trek-videos?keyword_search=${noc}`
  const res = await fetch(u, {
    headers: {
      'User-Agent': 'RCIPAggregatorBot/0.1 (+mailto:info@noccareers.ca)',
      Accept: 'text/html',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  const links = [...html.matchAll(/career-trek-videos\/(\d{5})\/(\d+)/g)].filter((m) => m[1] === noc)
  if (!links.length) return null
  const ids = [...new Set(links.map((m) => m[2]))]
  return {
    noc,
    path: `/plan-career/career-trek-videos/${noc}/${ids[0]}`,
    count: ids.length,
  }
}

const videos = {}
for (const noc of bcNocs) {
  try {
    const hit = await lookup(noc)
    console.log(`  ${noc}: ${hit ? `yes (${hit.count})` : 'no'}`)
    if (hit) videos[noc] = hit
  } catch (err) {
    console.warn(`  ${noc}: ${err.message}`)
  }
  await new Promise((r) => setTimeout(r, 200))
}

const payload = {
  generated_at: new Date().toISOString(),
  source: 'https://www.workbc.ca/plan-career/career-trek-videos',
  videos,
}

for (const p of outPaths) {
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(payload, null, 2))
  console.log('Wrote', p)
}
console.log(`Matched ${Object.keys(videos).length} / ${bcNocs.length}`)
