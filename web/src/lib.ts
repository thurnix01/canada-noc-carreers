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
