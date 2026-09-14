import type { HiringStatus, Listing } from './types'
import careerTrekData from './data/career-trek.json'

const UTM_SOURCE = 'rcip-aggregator'
const UTM_MEDIUM = 'referral'
const UTM_CAMPAIGN = 'bc-pilot'

const CAREER_TREK_VIDEOS = careerTrekData.videos as Record<
  string,
  { noc: string; path: string; count: number }
>

/** Primary Job Bank search hubs for multi-community RCIP regions. */
const JOB_BANK_LOCATIONS: Record<string, string> = {
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
}

export function withUtm(url: string, communityId: string, content: string): string {
  if (!url) return url
  try {
    const u = new URL(url)
    u.searchParams.set('utm_source', UTM_SOURCE)
    u.searchParams.set('utm_medium', UTM_MEDIUM)
    u.searchParams.set('utm_campaign', UTM_CAMPAIGN)
    u.searchParams.set('utm_content', `${communityId}-${content}`)
    return u.toString()
  } catch {
    return url
  }
}

export function typeLabel(type: Listing['type']): string {
  switch (type) {
    case 'priority_noc':
      return 'Eligible NOC'
    case 'employer':
      return 'Designated employer'
    case 'job':
      return 'Open role'
    default:
      return type
  }
}

/** Pull 5-digit NOC codes from listing fields / portal notes. */
export function extractNocCodes(...texts: Array<string | undefined | null>): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  for (const text of texts) {
    if (!text) continue
    for (const match of String(text).matchAll(/\b(?:NOC[\s-]*)?(\d{5})\b/gi)) {
      const code = match[1]
      if (seen.has(code)) continue
      seen.add(code)
      found.push(code)
    }
  }
  return found
}

/** Display NOCs for the card header (explicit field first, then codes found in notes). */
export function listingNocCodes(listing: Listing): string[] {
  const fromField = (listing.noc_code || '').replace(/\D/g, '')
  const fromNotes = extractNocCodes(listing.notes, listing.title)
  if (fromField.length === 5) {
    return [fromField, ...fromNotes.filter((c) => c !== fromField)]
  }
  return fromNotes
}

export function hiringStatusOf(listing: Listing): HiringStatus {
  if (listing.type === 'priority_noc') return 'eligible'
  if (listing.type === 'job') return 'open'
  if (listing.hiring_status === 'hiring') {
    // Never show Hiring unless Job Bank verification found postings.
    if (typeof listing.jobbank_hits === 'number') {
      return listing.jobbank_hits > 0 ? 'hiring' : 'unknown'
    }
    return 'unknown'
  }
  if (listing.hiring_status === 'not_hiring') return 'not_hiring'
  if (listing.hiring_status === 'unknown') return 'unknown'
  const blob = `${listing.notes} ${listing.title}`.toLowerCase()
  if (/\bnot\s+(currently\s+)?(hiring|recruiting)\b|\bnot\s+hiring\b|\bdo not contact\b/.test(blob)) {
    return 'not_hiring'
  }
  // Portal "seeking to hire" notes alone are not enough — need Job Bank hits.
  return 'unknown'
}

export function hiringStatusLabel(status: HiringStatus, listing?: Listing): string {
  switch (status) {
    case 'hiring': {
      const n = listing?.jobbank_hits
      return typeof n === 'number' && n > 0 ? `Hiring · ~${n} on Job Bank` : 'Hiring on Job Bank'
    }
    case 'not_hiring':
      return 'Not hiring now'
    case 'eligible':
      return 'Eligible occupation'
    case 'open':
      return 'Open posting'
    default:
      if (listing && listing.jobbank_hits === 0) return 'No Job Bank roles'
      return 'Hiring status unknown'
  }
}

export function formatVerifiedAt(iso: string): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Vancouver',
  }).format(new Date(t))
}

/** Job Bank search filtered by community hub + NOC code or employer name. */
export function jobBankSearchUrl(listing: Listing): string {
  const location =
    JOB_BANK_LOCATIONS[listing.community_id] ||
    [listing.community_name, listing.province].filter(Boolean).join(', ')
  const u = new URL('https://www.jobbank.gc.ca/jobsearch/jobsearch')
  u.searchParams.set('sort', 'M')
  // Wider radius for sparse rural hubs so NOC searches surface real openings.
  u.searchParams.set('d', listing.type === 'priority_noc' ? '500' : '100')
  if (location) u.searchParams.set('locationstring', location)

  const noc = (listing.noc_code || '').replace(/\D/g, '')
  if (listing.type === 'priority_noc' && noc.length === 5) {
    // Occupation filter (same chip Job Bank shows for NOC searches).
    u.searchParams.set('fn21', noc)
  } else if (noc.length === 5) {
    u.searchParams.set('fn21', noc)
  } else if (listing.type === 'employer' && listing.employer_name) {
    u.searchParams.set('empl', listing.employer_name)
  } else if (listing.title) {
    u.searchParams.set('searchstring', listing.title)
  }
  return u.toString()
}

export function jobBankButtonLabel(listing: Listing): string {
  const hits = listing.jobbank_hits
  if (typeof hits === 'number') {
    return hits > 0 ? `Job Bank · ~${hits}` : 'Job Bank · 0'
  }
  if (listing.type === 'priority_noc' && listing.noc_code) return `Job Bank · NOC ${listing.noc_code}`
  return 'Job Bank'
}

/** Title/tooltip for Job Bank count badges (snapshot, not live). */
export function jobBankCountTitle(
  listing: Listing,
  payloadCheckedAt?: string | null,
): string {
  const checked = listing.jobbank_checked_at || payloadCheckedAt || ''
  const asOf = formatVerifiedAt(checked)
  const base =
    'Job Bank count from our last weekly check near this community (not a live Canada-wide total).'
  return asOf ? `${base} As of ${asOf}.` : base
}

/** True when this card is for a B.C. community (or a NOC group that includes B.C.). */
export function listingTouchesBc(listing: Listing, communities?: Listing[]): boolean {
  if (listing.province === 'BC') return true
  return Boolean(communities?.some((c) => c.province === 'BC'))
}

/**
 * WorkBC Career Trek video URL for a NOC when a matching B.C. video exists.
 * Source: public Career Trek library (see data/career-trek.json).
 */
export function careerTrekUrl(nocCode: string): string | null {
  const noc = (nocCode || '').replace(/\D/g, '')
  if (noc.length !== 5) return null
  const hit = CAREER_TREK_VIDEOS[noc]
  if (!hit?.path) return null
  return `https://www.workbc.ca${hit.path}`
}

export function careerTrekButtonLabel(nocCode: string): string {
  const noc = (nocCode || '').replace(/\D/g, '')
  const count = CAREER_TREK_VIDEOS[noc]?.count
  if (typeof count === 'number' && count > 1) return `Career Trek · ${count} videos`
  return 'Career Trek · WorkBC'
}

export function careerTrekTitle(): string {
  return 'Unofficial link to WorkBC Career Trek — B.C. career videos. Not affiliated with WorkBC or IRCC.'
}

export function matchesQuery(listing: Listing, q: string): boolean {
  if (!q) return true
  const hay = [
    listing.noc_code,
    listing.title,
    listing.employer_name,
    listing.sector,
    listing.community_name,
    listing.locations,
    listing.notes,
  ]
    .join(' ')
    .toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token))
}

export type SortMode = 'alphabetical' | 'featured' | 'newest'

function titleKey(listing: Listing): string {
  return (listing.title || listing.employer_name || listing.noc_code || '').toLowerCase()
}

/** Hiring employers first, then eligible NOCs, then other employers / roles. */
function featuredRank(listing: Listing): number {
  if (listing.type === 'employer') {
    const status = hiringStatusOf(listing)
    if (status === 'hiring') return 0
    if (status === 'not_hiring') return 3
    return 2
  }
  if (listing.type === 'priority_noc') return 1
  return 4
}

export function sortListings(listings: Listing[], mode: SortMode): Listing[] {
  const rows = [...listings]
  if (mode === 'alphabetical') {
    rows.sort((a, b) => {
      const byTitle = titleKey(a).localeCompare(titleKey(b), undefined, { sensitivity: 'base' })
      if (byTitle) return byTitle
      return a.community_name.localeCompare(b.community_name)
    })
    return rows
  }
  if (mode === 'newest') {
    rows.sort((a, b) => {
      const ta = Date.parse(a.updated_at || '') || 0
      const tb = Date.parse(b.updated_at || '') || 0
      if (tb !== ta) return tb - ta
      return titleKey(a).localeCompare(titleKey(b), undefined, { sensitivity: 'base' })
    })
    return rows
  }
  rows.sort((a, b) => {
    const ra = featuredRank(a)
    const rb = featuredRank(b)
    if (ra !== rb) return ra - rb
    return titleKey(a).localeCompare(titleKey(b), undefined, { sensitivity: 'base' })
  })
  return rows
}

export type DisplayItem =
  | { kind: 'listing'; listing: Listing }
  | { kind: 'noc_group'; listing: Listing; communities: Listing[] }

/** Prefer the longest occupation title and best Job Bank hit count as the group face. */
function canonicalNocListing(rows: Listing[]): Listing {
  return [...rows].sort((a, b) => {
    const hitsA = typeof a.jobbank_hits === 'number' ? a.jobbank_hits : -1
    const hitsB = typeof b.jobbank_hits === 'number' ? b.jobbank_hits : -1
    if (hitsB !== hitsA) return hitsB - hitsA
    return (b.title?.length || 0) - (a.title?.length || 0)
  })[0]
}

/**
 * When browsing all communities, collapse the same eligible NOC into one card
 * so "Auto body…" doesn't repeat once per RCIP community.
 */
export function toDisplayItems(listings: Listing[], groupNocs: boolean): DisplayItem[] {
  if (!groupNocs) return listings.map((listing) => ({ kind: 'listing', listing }))

  const byNoc = new Map<string, Listing[]>()
  const rest: Listing[] = []
  for (const listing of listings) {
    if (listing.type === 'priority_noc' && listing.noc_code) {
      const rows = byNoc.get(listing.noc_code) || []
      rows.push(listing)
      byNoc.set(listing.noc_code, rows)
    } else {
      rest.push(listing)
    }
  }

  const items: DisplayItem[] = []
  for (const rows of byNoc.values()) {
    if (rows.length === 1) items.push({ kind: 'listing', listing: rows[0] })
    else {
      const ordered = [...rows].sort((a, b) =>
        a.community_name.localeCompare(b.community_name, undefined, { sensitivity: 'base' }),
      )
      items.push({ kind: 'noc_group', listing: canonicalNocListing(ordered), communities: ordered })
    }
  }
  for (const listing of rest) items.push({ kind: 'listing', listing })

  // Keep overall order aligned with the already-sorted input (title / featured / newest).
  const rank = new Map(listings.map((l, i) => [l.id, i]))
  items.sort((a, b) => {
    const aId = a.kind === 'listing' ? a.listing.id : a.communities[0]?.id
    const bId = b.kind === 'listing' ? b.listing.id : b.communities[0]?.id
    return (rank.get(aId) ?? 0) - (rank.get(bId) ?? 0)
  })
  return items
}
