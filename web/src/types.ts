export type ListingType = 'priority_noc' | 'employer' | 'job'

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
  updated_at: string
}

export type ListingsPayload = {
  generated_at: string
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
