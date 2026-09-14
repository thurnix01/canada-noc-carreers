export type ListingType = 'priority_noc' | 'employer' | 'job'

/** Employer hiring signal: 'hiring' only when Job Bank has matching postings. */
export type HiringStatus = 'hiring' | 'not_hiring' | 'unknown' | 'eligible' | 'open'

export type Community = {
  id: string
  name: string
  province: string
  portal_url: string
  jobs_url: string
  scrape_status?: string
}

export type Listing = {
  id: string
  type: ListingType
  community_id: string
  community_name: string
  province: string
  noc_code: string
  title: string
  sector: string
  employer_name: string
  locations: string
  source_url: string
  portal_url: string
  jobs_url: string
  notes: string
  /** ISO timestamp when this row was last confirmed against the official source. */
  updated_at: string
  hiring_status: HiringStatus
  /** Job Bank postings found for this employer near the community hub (when checked). */
  jobbank_hits?: number | null
  /** ISO timestamp when jobbank_hits was last fetched for this row. */
  jobbank_checked_at?: string
}

export type ListingsPayload = {
  generated_at: string
  /** ISO timestamp of the last Job Bank count refresh (null/omit if skipped). */
  jobbank_checked_at?: string | null
  sheet_id: string
  counts: {
    communities: number
    priority_nocs: number
    employers: number
    jobs: number
    total: number
  }
  communities: Community[]
  listings: Listing[]
}
