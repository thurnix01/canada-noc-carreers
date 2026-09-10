import type { Listing } from './types'

const UTM_SOURCE = 'rcip-aggregator'
const UTM_MEDIUM = 'referral'
const UTM_CAMPAIGN = 'bc-pilot'

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
    const blob = `${listing.notes} ${listing.title}`.toLowerCase()
    if (/\bnot\s+(currently\s+)?(hiring|recruiting)\b|\bnot\s+hiring\b/.test(blob)) return 3
    if (/\b(currently\s+)?hiring\b|\brecruiting\b/.test(blob)) return 0
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
