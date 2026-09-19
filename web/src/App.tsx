import { useDeferredValue, useEffect, useMemo, useRef, useState, startTransition } from 'react'
import type { Listing, ListingType, ListingsPayload } from './types'
import {
  careerTrekButtonLabel,
  careerTrekTitle,
  careerTrekUrl,
  formatVerifiedAt,
  hiringStatusLabel,
  hiringStatusOf,
  jobBankButtonLabel,
  jobBankCountTitle,
  jobBankSearchUrl,
  listingNocCodes,
  listingTouchesBc,
  matchesQuery,
  sortListings,
  toDisplayItems,
  typeLabel,
  visiblePages,
  withUtm,
  type DisplayItem,
  type SortMode,
} from './lib'
import './index.css'

const TYPE_OPTIONS: { value: '' | ListingType; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'priority_noc', label: 'Eligible NOCs' },
  { value: 'employer', label: 'Designated employers' },
]

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'alphabetical', label: 'Alphabetically' },
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'noc', label: 'By NOC' },
  { value: 'employer', label: 'Designated employer' },
  { value: 'eligible_noc', label: 'Eligible NOC' },
]

const DESKTOP_PAGER_MQ = '(min-width: 861px)'
const FALLBACK_PAGE_SIZE = 8

/** Place photography for directory cards (portal heroes + Commons fills). */
const COMMUNITY_PHOTOS: Record<string, string> = {
  'west-kootenay': 'communities/west-kootenay.jpg',
  'north-okanagan-shuswap': 'communities/north-okanagan-shuswap.jpg',
  'peace-liard': 'communities/peace-liard.jpg',
  'pictou-county': 'communities/pictou-county.jpg',
  'north-bay': 'communities/north-bay.jpg',
  sudbury: 'communities/sudbury.jpg',
  timmins: 'communities/timmins.jpg',
  'sault-ste-marie': 'communities/sault-ste-marie.jpg',
  'thunder-bay': 'communities/thunder-bay.jpg',
  steinbach: 'communities/steinbach.jpg',
  'altona-rhineland': 'communities/altona-rhineland.jpg',
  brandon: 'communities/brandon.jpg',
  'moose-jaw': 'communities/moose-jaw.jpg',
  claresholm: 'communities/claresholm.jpg',
}

const img = (name: string) => `${import.meta.env.BASE_URL}images/${name}`

function ResultCard({
  listing,
  index,
  communities,
  onSelectCommunity,
  jobbankCheckedAt,
}: {
  listing: Listing
  index: number
  communities?: Listing[]
  onSelectCommunity?: (communityId: string) => void
  jobbankCheckedAt?: string | null
}) {
  const primary = withUtm(listing.source_url || listing.portal_url, listing.community_id, listing.type)
  const jobsLink = listing.jobs_url
    ? withUtm(listing.jobs_url, listing.community_id, 'find-job')
    : ''
  const hiringStatus = hiringStatusOf(listing)
  const verified = formatVerifiedAt(listing.updated_at)
  const jobBank = withUtm(jobBankSearchUrl(listing), listing.community_id, 'jobbank')
  const jobBankTitle = jobBankCountTitle(listing, jobbankCheckedAt)
  const nocForTrek = listing.type === 'priority_noc' ? listing.noc_code : ''
  const trekRaw =
    listing.type === 'priority_noc' && listingTouchesBc(listing, communities)
      ? careerTrekUrl(nocForTrek)
      : null
  const careerTrek = trekRaw
    ? withUtm(trekRaw, listing.community_id || 'bc', 'career-trek')
    : ''
  const showHiringBadge = listing.type === 'employer' || listing.type === 'job'
  const nocJobBankHits =
    listing.type === 'priority_noc' && typeof listing.jobbank_hits === 'number'
      ? listing.jobbank_hits
      : null
  const grouped = Boolean(communities && communities.length > 1)
  const place = grouped
    ? `${communities!.length} RCIP communities`
    : [listing.community_name, listing.province].filter(Boolean).join(', ')
  const metaBits = [listing.sector, listing.locations, place, verified ? `Verified ${verified}` : ''].filter(
    Boolean,
  )
  // Avoid a second tip when notes only repeat the hiring flag (e.g. "Source status: Hiring").
  const employerExtraNotes =
    listing.type === 'employer' && listing.notes
      ? (() => {
          const n = listing.notes.trim()
          if (/^source status:\s*/i.test(n)) return ''
          if (/^source marks this employer/i.test(n)) return ''
          if (/designated\s*[≠!=]+\s*hiring/i.test(n)) return ''
          return n
        })()
      : ''
  const uniqueNotes = grouped
    ? [
        ...new Set(
          (communities || [])
            .map((c) => c.notes?.trim())
            .filter((n): n is string => Boolean(n)),
        ),
      ]
    : listing.notes && listing.type === 'priority_noc'
      ? [listing.notes]
      : []
  const nocCodes = listingNocCodes(listing)
  const nocLabel =
    nocCodes.length === 0
      ? ''
      : nocCodes.length === 1
        ? `NOC ${nocCodes[0]}`
        : `NOC ${nocCodes.slice(0, 3).join(' · ')}`

  return (
    <article className="card" style={{ animationDelay: `${Math.min(index, 16) * 0.035}s` }}>
      <div className="card-top">
        <div className="card-tags">
          <span className={`badge type-${listing.type}`}>{typeLabel(listing.type)}</span>
          {grouped ? (
            <span className="badge">Eligible in {communities!.length} places</span>
          ) : null}
          {showHiringBadge ? (
            <span className={`badge status-${hiringStatus}`} title={jobBankTitle}>
              {hiringStatusLabel(hiringStatus, listing)}
            </span>
          ) : null}
          {nocJobBankHits != null && nocJobBankHits > 0 ? (
            <span className="badge status-hiring" title={jobBankTitle}>
              ~{nocJobBankHits} on Job Bank
            </span>
          ) : null}
          {nocJobBankHits === 0 ? (
            <span className="badge status-unknown" title={jobBankTitle}>
              No Job Bank roles
            </span>
          ) : null}
        </div>
        {nocLabel ? (
          <span className="noc" title={nocCodes.join(', ')}>
            {nocLabel}
          </span>
        ) : null}
      </div>
      <h3>{listing.title}</h3>
      {metaBits.length ? <p className="card-meta">{metaBits.join(' · ')}</p> : null}
      {grouped ? (
        <div className="card-communities" aria-label="Eligible communities">
          {communities!.map((c) => (
            <button
              key={c.id}
              type="button"
              className="community-chip"
              onClick={() => onSelectCommunity?.(c.community_id)}
              title={`Filter to ${c.community_name}`}
            >
              {c.community_name}
              {c.province ? `, ${c.province}` : ''}
            </button>
          ))}
        </div>
      ) : null}
      {uniqueNotes.map((note) => (
        <p key={note.slice(0, 48)} className="card-tip">
          {note}
        </p>
      ))}
      {employerExtraNotes ? <p className="card-tip">{employerExtraNotes}</p> : null}
      <div className="actions">
        {!grouped && primary ? (
          <a className="btn btn-primary" href={primary} target="_blank" rel="noreferrer noopener">
            Official list
            <span aria-hidden="true">↗</span>
          </a>
        ) : null}
        <a
          className="btn btn-ghost"
          href={jobBank}
          target="_blank"
          rel="noreferrer noopener"
          title={jobBankTitle}
        >
          {jobBankButtonLabel(listing)}
        </a>
        {careerTrek ? (
          <a
            className="btn btn-ghost"
            href={careerTrek}
            target="_blank"
            rel="noreferrer noopener"
            title={careerTrekTitle()}
          >
            {careerTrekButtonLabel(nocForTrek)}
            <span aria-hidden="true">↗</span>
          </a>
        ) : null}
        {!grouped && jobsLink ? (
          <a className="btn btn-ghost" href={jobsLink} target="_blank" rel="noreferrer noopener">
            Community jobs
          </a>
        ) : null}
        {!grouped && listing.portal_url && listing.portal_url !== listing.source_url ? (
          <a
            className="btn btn-ghost"
            href={withUtm(listing.portal_url, listing.community_id, 'portal')}
            target="_blank"
            rel="noreferrer noopener"
          >
            Community portal
          </a>
        ) : null}
      </div>
    </article>
  )
}

function SortSelect({
  value,
  onChange,
}: {
  value: SortMode
  onChange: (next: SortMode) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const current = SORT_OPTIONS.find((opt) => opt.value === value) || SORT_OPTIONS[0]

  useEffect(() => {
    if (!open) return
    const onDoc = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`sort-field ${open ? 'is-open' : ''}`} ref={wrapRef}>
      <span className="field-label" id="sort-label">
        Sort
      </span>
      <button
        type="button"
        className="sort-trigger"
        id="sort-results"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby="sort-label sort-results"
        onClick={() => setOpen((next) => !next)}
      >
        {current.label}
      </button>
      {open ? (
        <ul className="sort-menu" role="listbox" aria-labelledby="sort-label">
          {SORT_OPTIONS.map((opt) => (
            <li key={opt.value} role="none">
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={opt.value === value ? 'is-active' : ''}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export default function App() {
  const [data, setData] = useState<ListingsPayload | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [community, setCommunity] = useState('')
  const [type, setType] = useState<'' | ListingType>('')
  const [sort, setSort] = useState<SortMode>('featured')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(FALLBACK_PAGE_SIZE)
  const [desktopPager, setDesktopPager] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_PAGER_MQ).matches,
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const [navScrolled, setNavScrolled] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const deferredQuery = useDeferredValue(query)
  const exploreRef = useRef<HTMLElement | null>(null)
  const sidebarCardRef = useRef<HTMLDivElement | null>(null)
  const resultsRef = useRef<HTMLElement | null>(null)
  const resultsScrollRef = useRef<HTMLDivElement | null>(null)
  const copyResetRef = useRef<number | null>(null)

  const shareUrl = 'https://noccareers.ca'
  const shareMessage =
    'A free starting point for RCIP: search priority NOCs and designated employers, then continue on the official community portal.'
  const shareText = `${shareMessage} ${shareUrl}`

  useEffect(() => {
    document.documentElement.style.setProperty('--topo-image', `url(${img('topo-light.jpg')})`)
  }, [])

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      setNavScrolled(y > 12)
      setShowScrollTop(y > 480)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('nav-lock')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('nav-lock')
    }
  }, [menuOpen])

  useEffect(() => {
    return () => {
      if (copyResetRef.current) window.clearTimeout(copyResetRef.current)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch(`${import.meta.env.BASE_URL}data/listings.json`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not load listings.json (${res.status})`)
        return res.json() as Promise<ListingsPayload>
      })
      .then((payload) => {
        if (!cancelled) setData(payload)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const communityStats = useMemo(() => {
    if (!data) return []
    return data.communities.map((c) => {
      const rows = data.listings.filter((l) => l.community_id === c.id)
      return {
        ...c,
        nocs: rows.filter((r) => r.type === 'priority_noc').length,
        employers: rows.filter((r) => r.type === 'employer').length,
        total: rows.length,
        directoryOnly: c.scrape_status === 'directory' || rows.length === 0,
      }
    })
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return []
    const rows = data.listings.filter((item) => {
      if (community && item.community_id !== community) return false
      if (type && item.type !== type) return false
      return matchesQuery(item, deferredQuery)
    })
    return sortListings(rows, sort)
  }, [data, community, type, deferredQuery, sort])

  const displayItems = useMemo(
    () => toDisplayItems(filtered, !community),
    [filtered, community],
  )

  const hasFilters = Boolean(deferredQuery || community || type)
  const pageCount = Math.max(1, Math.ceil(displayItems.length / pageSize))
  const pagedItems = desktopPager
    ? displayItems.slice((page - 1) * pageSize, page * pageSize)
    : displayItems.slice(0, 200)

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_PAGER_MQ)
    const sync = () => setDesktopPager(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    setPage(1)
  }, [deferredQuery, community, type, sort])

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount))
  }, [pageCount])

  const goToPage = (next: number) => {
    const clamped = Math.min(pageCount, Math.max(1, next))
    setPage(clamped)
    resultsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    const sidebar = sidebarCardRef.current
    const results = resultsRef.current
    if (!sidebar || !results) return

    const syncLayout = () => {
      if (window.matchMedia('(max-width: 860px)').matches) {
        results.style.height = ''
        return
      }
      results.style.height = `${Math.round(sidebar.getBoundingClientRect().height)}px`
      const scroll = resultsScrollRef.current
      const card = scroll?.querySelector('.card')
      if (!scroll || !card) return
      const list = scroll.querySelector('.list')
      const gap = list ? parseFloat(getComputedStyle(list).rowGap || getComputedStyle(list).gap || '14') : 14
      const row = card.getBoundingClientRect().height + gap
      if (row < 80) return
      const rows = Math.max(4, Math.floor((scroll.clientHeight + gap) / row))
      const nextSize = Math.max(8, rows * 2)
      setPageSize((current) => (current === nextSize ? current : nextSize))
    }

    syncLayout()
    const observer = new ResizeObserver(syncLayout)
    observer.observe(sidebar)
    window.addEventListener('resize', syncLayout)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', syncLayout)
    }
  }, [data, communityStats.length, pagedItems.length])

  const scrollToExplore = () => {
    setMenuOpen(false)
    exploreRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const scrollToTop = () => {
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const closeMenu = () => setMenuOpen(false)

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setLinkCopied(true)
      if (copyResetRef.current) window.clearTimeout(copyResetRef.current)
      copyResetRef.current = window.setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      window.prompt('Copy this link:', shareUrl)
    }
  }

  const shareNative = async () => {
    if (!navigator.share) return
    try {
      await navigator.share({ title: 'NOC Careers', text: shareMessage, url: shareUrl })
    } catch {
      /* user cancelled */
    }
  }

  const NAV_LINKS = [
    { href: '#about', label: 'How it works' },
    { href: '#impact', label: 'Impact' },
    { href: '#communities', label: 'Communities' },
    { href: '#explore', label: 'Search' },
    { href: '#next-steps', label: 'Next steps' },
    { href: '#share', label: 'Share' },
    { href: '#contact', label: 'Contact' },
  ] as const

  const SHARE_TARGETS = [
    {
      id: 'facebook',
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    },
    {
      id: 'x',
      label: 'X',
      href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareMessage)}`,
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      href: `https://wa.me/?text=${encodeURIComponent(shareText)}`,
    },
    {
      id: 'linkedin',
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
    },
    {
      id: 'email',
      label: 'Email',
      href: `mailto:?subject=${encodeURIComponent('NOC Careers — RCIP search aid')}&body=${encodeURIComponent(shareText)}`,
    },
  ] as const

  const clearFilters = () => {
    startTransition(() => {
      setQuery('')
      setCommunity('')
      setType('')
    })
  }

  if (error) {
    return (
      <div className="shell">
        <p className="empty">Failed to load data: {error}. Run `npm run export:data` from the project root.</p>
      </div>
    )
  }

  if (!data) {
    return <div className="loading">Loading RCIP listings…</div>
  }

  return (
    <>
      <div className="topbar">
        <div className="shell topbar-inner">
          <span>Rural Community Immigration Pilot · Canada</span>
          <span>Search the lists. Confirm on the official portal.</span>
        </div>
      </div>

      <header className={`site-nav ${navScrolled ? 'is-scrolled' : ''} ${menuOpen ? 'is-open' : ''}`}>
        <div className="shell site-nav-inner">
          <a className="logo" href="#top" onClick={closeMenu}>
            <img
              className="logo-mark"
              src={img('noc-careers-logo.svg')}
              alt="NOC Careers"
              width={220}
              height={37}
            />
          </a>

          <nav
            id="site-menu"
            className={`nav-links ${menuOpen ? 'is-open' : ''}`}
            aria-label="Primary"
          >
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} onClick={closeMenu}>
                {link.label}
              </a>
            ))}
            <button type="button" className="btn btn-primary nav-cta nav-cta-mobile" onClick={scrollToExplore}>
              Search listings
            </button>
          </nav>

          <button type="button" className="btn btn-primary nav-cta nav-cta-desktop" onClick={scrollToExplore}>
            Search listings
          </button>

          <button
            type="button"
            className={`nav-toggle ${menuOpen ? 'is-open' : ''}`}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
        </div>
      </header>

      {menuOpen ? (
        <button type="button" className="nav-backdrop" aria-label="Close menu" onClick={closeMenu} />
      ) : null}

      <div className="site-header" id="top">
        <div className="shell header-inner">
          <section className="hero">
            <div className="hero-copy">
              <p className="pill">A starting point for rural Canada</p>
              <h1>
                See <span>where your work is wanted</span> — then take the official next step
              </h1>
              <p className="lede">
                Search priority occupations and designated employers across all 14 RCIP communities. This is
                an unofficial aid: when you find a match, continue on that community’s portal.
              </p>
              <div className="hero-actions">
                <button type="button" className="btn btn-primary btn-lg" onClick={scrollToExplore}>
                  Search listings
                </button>
                <a className="btn btn-outline btn-lg" href="#about">
                  How it works
                </a>
              </div>
            </div>

            <div className="hero-media">
              <div className="hero-frame">
                <img
                  src={img('hero-flag.jpg')}
                  alt="Person smiling while holding a Canadian flag outdoors"
                  width={900}
                  height={400}
                />
              </div>
              <div className="trust-chip">
                <span className="trust-stars" aria-hidden="true">
                  ★★★★★
                </span>
                <div>
                  <strong>All 14 RCIP communities</strong>
                  <span>
                    {data.counts.priority_nocs.toLocaleString()} NOCs ·{' '}
                    {data.counts.employers.toLocaleString()} employers
                  </span>
                </div>
              </div>
              <div className="stat-card">
                <strong>{data.counts.total.toLocaleString()}</strong>
                <span>searchable listings</span>
              </div>
            </div>
          </section>

          <form
            className="search-dock"
            onSubmit={(e) => {
              e.preventDefault()
              scrollToExplore()
            }}
          >
            <label className="dock-field">
              <span>Search</span>
              <input
                type="search"
                placeholder="NOC, title, or employer"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label className="dock-field">
              <span>Community</span>
              <select
                value={community}
                onChange={(e) => startTransition(() => setCommunity(e.target.value))}
              >
                <option value="">All communities</option>
                {data.communities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}, {c.province}
                  </option>
                ))}
              </select>
            </label>
            <label className="dock-field">
              <span>Listing type</span>
              <select
                value={type}
                onChange={(e) => startTransition(() => setType(e.target.value as '' | ListingType))}
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn-primary btn-lg dock-submit">
              Search listings
            </button>
          </form>
        </div>
      </div>

      <div className="shell shell-main">
      <section className="split about" id="about">
        <div className="collage" aria-hidden="true">
          <img src={img('warehouse.jpg')} alt="" className="collage-main" />
          <img src={img('healthcare.jpg')} alt="" className="collage-top" />
          <img src={img('farmers.jpg')} alt="" className="collage-bot" />
        </div>
        <div className="split-copy">
          <p className="pill">How it works</p>
          <h2>Three steps. Then the official portal.</h2>
          <p>
            RCIP lists live on 14 community sites, not one federal page. Use this search to compare them
            quickly — then verify and apply only where the community tells you to.
          </p>
          <ul className="feature-list">
            <li>
              <span className="feat-icon" aria-hidden="true">
                1
              </span>
              <div>
                <strong>Search your NOC or job title</strong>
                <p>See which communities currently list that occupation.</p>
              </div>
            </li>
            <li>
              <span className="feat-icon" aria-hidden="true">
                2
              </span>
              <div>
                <strong>Open Job Bank from the card</strong>
                <p>A designated employer is not the same as a job opening. Look for a public posting.</p>
              </div>
            </li>
            <li>
              <span className="feat-icon" aria-hidden="true">
                3
              </span>
              <div>
                <strong>Finish on the community portal</strong>
                <p>We never take applications or give immigration advice.</p>
              </div>
            </li>
          </ul>
          <button type="button" className="btn btn-primary" onClick={scrollToExplore}>
            Search listings
          </button>
        </div>
      </section>

      <section className="impact" id="impact">
        <div className="section-head">
          <p className="pill">Why this pathway exists</p>
          <h2>Rural communities are already recommending people with real job offers</h2>
          <p>
            These figures come from public community and press reports about RCIP — not IRCC national
            totals, and not results from this website.
          </p>
        </div>

        <div className="impact-grid">
          <article className="impact-stat">
            <strong>14</strong>
            <span>RCIP communities across Canada recommending workers for permanent residence</span>
          </article>
          <article className="impact-stat">
            <strong>1,000+</strong>
            <span>
              Community recommendations reported in 2025 from Sudbury (517), Thunder Bay (475), and
              North Bay (190) alone
            </span>
          </article>
          <article className="impact-stat">
            <strong>~800</strong>
            <span>
              Permanent residency grants reported in the first two months of 2026 as demand stayed high
            </span>
          </article>
          <article className="impact-stat">
            <strong>{data.counts.total.toLocaleString()}</strong>
            <span>
              Live listings on this site right now — {data.counts.priority_nocs.toLocaleString()}{' '}
              priority NOCs and {data.counts.employers.toLocaleString()} designated employers
            </span>
          </article>
        </div>

        <div className="impact-panels">
          <div className="impact-panel">
            <h3>What the pilot is for</h3>
            <ul>
              <li>
                Fill hard-to-staff work — health, trades, early childhood, hospitality — with people who
                already have a job offer.
              </li>
              <li>
                Keep each year’s recommendations focused on priority occupations, with caps so one NOC
                does not use the whole allotment.
              </li>
              <li>
                Often retain people already living and working in the region as temporary residents.
              </li>
            </ul>
          </div>
        </div>
        <p className="impact-cite">
          Sources: community RCIP updates and press coverage of 2025–2026 pilot activity (e.g. CIC News
          year-in-review; Canadian Press reporting). Always confirm current rules on{' '}
          <a
            href="https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/rural-franco-pilots/rural-immigration.html"
            target="_blank"
            rel="noreferrer noopener"
          >
            Canada.ca
          </a>{' '}
          and your community portal.
        </p>
      </section>

      <section className="communities" id="communities">
        <div className="section-head">
          <p className="pill">14 communities</p>
          <h2>Choose a region, or search them all</h2>
          <p>
            Cards with counts are searchable here. Cards marked “Portal only” still send you to the
            official site until that list is in the explorer.
          </p>
        </div>
        <div className="community-cards">
          <button
            type="button"
            className={`community-card ${community === '' ? 'is-active' : ''}`}
            onClick={() => {
              startTransition(() => setCommunity(''))
              scrollToExplore()
            }}
          >
            <div className="community-card-media">
              <img src={img('friends-flags.jpg')} alt="" />
            </div>
            <div>
              <strong>All communities</strong>
              <span>
                {data.counts.communities} regions · {data.counts.total} listings
              </span>
            </div>
          </button>
          {communityStats.map((c) => {
            const photo = COMMUNITY_PHOTOS[c.id] || 'friends-flags.jpg'
            const portal = c.portal_url ? withUtm(c.portal_url, c.id, 'directory-card') : ''
            return (
              <div
                key={c.id}
                className={`community-card ${community === c.id ? 'is-active' : ''} ${c.directoryOnly ? 'is-directory' : ''}`}
              >
                <button
                  type="button"
                  className="community-card-main"
                  onClick={() => {
                    startTransition(() => setCommunity(community === c.id ? '' : c.id))
                    scrollToExplore()
                  }}
                >
                  <div className="community-card-media">
                    <img src={img(photo)} alt="" />
                  </div>
                  <div>
                    <strong>
                      {c.name}
                      <em>{c.province}</em>
                    </strong>
                    <span>
                      {c.directoryOnly
                        ? 'Portal only — open the official site'
                        : `${c.nocs} NOCs · ${c.employers} employers`}
                    </span>
                  </div>
                </button>
                {portal ? (
                  <a
                    className="community-portal-link"
                    href={portal}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Official portal
                    <span aria-hidden="true">↗</span>
                  </a>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      <section className="explore" id="explore" ref={exploreRef}>
        <div className="section-head explore-head">
          <p className="pill">Search</p>
          <h2>Find your NOC or a designated employer</h2>
          <p>
            Updated {new Date(data.generated_at).toLocaleString()}
            {data.jobbank_checked_at
              ? ` · Job Bank counts as of ${formatVerifiedAt(data.jobbank_checked_at)}`
              : ''}{' '}
            · {displayItems.length.toLocaleString()} shown
            {hasFilters ? ' (filtered)' : ''}
            {!community ? ' · same NOC grouped across communities' : ''}
          </p>
          <p className="explore-credit">
            B.C. NOCs may include{' '}
            <a
              href="https://www.workbc.ca/plan-career/career-trek-videos"
              target="_blank"
              rel="noreferrer noopener"
            >
              WorkBC Career Trek
            </a>{' '}
            videos. WorkBC does not endorse this site.
          </p>
        </div>

        <div className="workspace">
          <aside className="sidebar" aria-label="Refine results">
            <div className="sidebar-card" ref={sidebarCardRef}>
              <div className="card-legend">
                <strong>How to read a card</strong>
                <ul>
                  <li>
                    <strong>Eligible NOC</strong> = that occupation is on the community’s current priority
                    list.
                  </li>
                  <li>
                    <strong>Designated employer</strong> = they may support an RCIP job offer; it does not
                    mean they are hiring you.
                  </li>
                  <li>
                    <strong>Job Bank counts</strong> are weekly snapshots, not live totals.
                  </li>
                  <li>Click a community name on a grouped card to search that place only.</li>
                </ul>
              </div>
              <div className="field">
                <label htmlFor="q">Search NOC, title, or employer</label>
                <input
                  id="q"
                  type="search"
                  placeholder="e.g. 42202 or early childhood"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <div className="field">
                <span className="field-label">Listing type</span>
                <div className="chip-row" role="group" aria-label="Listing type">
                  {TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      className={`chip ${type === opt.value ? 'is-active' : ''}`}
                      onClick={() => startTransition(() => setType(opt.value))}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <span className="field-label">Community</span>
                <div className="community-grid">
                  <button
                    type="button"
                    className={`community-tile ${community === '' ? 'is-active' : ''}`}
                    onClick={() => startTransition(() => setCommunity(''))}
                  >
                    All communities
                  </button>
                  {communityStats.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`community-tile ${community === c.id ? 'is-active' : ''}`}
                      onClick={() =>
                        startTransition(() => setCommunity(community === c.id ? '' : c.id))
                      }
                    >
                      {c.name}{c.province ? `, ${c.province}` : ''}
                    </button>
                  ))}
                </div>
              </div>

              {hasFilters ? (
                <button type="button" className="clear-btn" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : null}

              <p className="notice">
                Unofficial aid — not IRCC or a community office. Do not email designated employers. Apply
                only to jobs that are publicly posted, then confirm on the source site.
              </p>
            </div>
          </aside>

          <main className="results" aria-live="polite" ref={resultsRef}>
            <div className="results-toolbar">
              {desktopPager && displayItems.length > pageSize ? (
                <nav className="pagination" aria-label="Search results pages">
                  <button
                    type="button"
                    className="page-btn page-nav"
                    disabled={page <= 1}
                    onClick={() => goToPage(page - 1)}
                  >
                    Prev
                  </button>
                  {visiblePages(page, pageCount).map((item, index) =>
                    item === 'ellipsis' ? (
                      <span key={`ellipsis-${index}`} className="page-ellipsis" aria-hidden="true">
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        className={`page-btn ${page === item ? 'is-active' : ''}`}
                        aria-current={page === item ? 'page' : undefined}
                        onClick={() => goToPage(item)}
                      >
                        {item}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    className="page-btn page-nav"
                    disabled={page >= pageCount}
                    onClick={() => goToPage(page + 1)}
                  >
                    Next
                  </button>
                </nav>
              ) : null}
              <SortSelect
                value={sort}
                onChange={(next) => startTransition(() => setSort(next))}
              />
            </div>

            <div className="results-scroll" ref={resultsScrollRef}>
              {displayItems.length === 0 ? (
                <p className="empty">
                  {community && communityStats.find((c) => c.id === community)?.directoryOnly
                    ? 'No searchable listings for this community yet — use Official portal on the community card.'
                    : 'No matches. Try a 5-digit NOC, a shorter job title, or clear filters.'}
                </p>
              ) : (
                <div className="list">
                  {pagedItems.map((item: DisplayItem, index) =>
                    item.kind === 'noc_group' ? (
                      <ResultCard
                        key={`noc-${item.listing.noc_code}`}
                        listing={item.listing}
                        index={index}
                        communities={item.communities}
                        onSelectCommunity={(id) => startTransition(() => setCommunity(id))}
                        jobbankCheckedAt={data.jobbank_checked_at}
                      />
                    ) : (
                      <ResultCard
                        key={item.listing.id}
                        listing={item.listing}
                        index={index}
                        jobbankCheckedAt={data.jobbank_checked_at}
                      />
                    ),
                  )}
                </div>
              )}
              {!desktopPager && displayItems.length > 200 ? (
                <p className="empty truncate-note">
                  Showing first 200 of {displayItems.length.toLocaleString()}. Narrow your search.
                </p>
              ) : null}
            </div>
          </main>
        </div>
      </section>

      <section className="support" id="next-steps">
        <div className="support-media">
          <img
            src={img('citizens.jpg')}
            alt="Community members wearing civic pins together"
            width={900}
            height={400}
          />
          <div className="stat-float">
            <strong>{data.counts.communities}</strong>
            <span>RCIP communities on this site</span>
          </div>
        </div>
        <div className="support-copy">
          <p className="pill">After you find a match</p>
          <h2>Four checks before you apply</h2>
          <p>
            A list is a map, not a permission slip. Use it to aim — then follow that community’s process.
          </p>
          <div className="info-box">
            <strong>Before you apply</strong>
            <ul>
              <li>The NOC is still on that community’s current priority list.</li>
              <li>The employer is designated for the role you want.</li>
              <li>
                There is a public job posting (Job Bank, the portal, or the employer’s careers page).
              </li>
              <li>
                You will meet IRCC’s language, education, experience, and settlement-fund rules — the
                community cannot skip those.
              </li>
            </ul>
          </div>
          <div className="useful-links">
            <strong>Official starting points</strong>
            <a
              href="https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/rural-franco-pilots/rural-immigration.html"
              target="_blank"
              rel="noreferrer noopener"
            >
              IRCC — Rural Community Immigration Pilot
            </a>
            <a
              href="https://www.jobbank.gc.ca/home"
              target="_blank"
              rel="noreferrer noopener"
            >
              Job Bank Canada
            </a>
            <a href="#communities">Community portals on this site</a>
            <a href="#share">If this saved you time, send it to someone still opening 14 tabs.</a>
          </div>
        </div>
      </section>

      <section className="cta-banner" id="share" aria-labelledby="share-heading">
        <div className="cta-copy">
          <p className="cta-kicker">Pass it on</p>
          <h2 id="share-heading">Help someone else find their community</h2>
          <p>
            Settlement workers, classmates, and family often need the same starting point. Send the
            link — they should still verify on the official portal.
          </p>

          <div className="share-panel">
            <p className="share-label">Share your link</p>
            <div className="share-link-row">
              <input
                className="share-link-input"
                type="text"
                value={shareUrl}
                readOnly
                aria-label="Site link"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button type="button" className="btn btn-light share-copy-btn" onClick={copyShareLink}>
                {linkCopied ? 'Copied' : 'Copy link'}
              </button>
              {typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? (
                <div className="share-actions">
                  <button type="button" className="btn btn-light" onClick={shareNative}>
                    Share from device
                  </button>
                </div>
              ) : null}
            </div>

            <p className="share-label">Share to</p>
            <div className="share-row">
              <div className="share-targets" role="list">
                {SHARE_TARGETS.map((target) => (
                  <a
                    key={target.id}
                    className={`share-target share-target-${target.id}`}
                    href={target.href}
                    target={target.id === 'email' ? undefined : '_blank'}
                    rel={target.id === 'email' ? undefined : 'noreferrer noopener'}
                    role="listitem"
                  >
                    <span className="share-target-icon" aria-hidden="true">
                      {target.id === 'facebook'
                        ? 'f'
                        : target.id === 'x'
                          ? '𝕏'
                          : target.id === 'whatsapp'
                            ? 'W'
                            : target.id === 'linkedin'
                              ? 'in'
                              : '@'}
                    </span>
                    <span>{target.label}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="cta-photo-wrap">
          <img src={img('retail.jpg')} alt="" className="cta-photo" />
        </div>
      </section>

      <section className="contact" id="contact">
        <div className="contact-copy">
          <p className="pill">Contact</p>
          <h2>Corrections, walkthroughs, and partnerships</h2>
          <p>
            We maintain this unofficial search for candidates, community offices, and settlement staff. We
            do not give immigration advice or process applications.
          </p>
          <a className="contact-email" href="mailto:info@noccareers.ca">
            info@noccareers.ca
          </a>
          <ul className="contact-points">
            <li>Tell us if a NOC or employer list looks out of date</li>
            <li>Book a 15-minute walkthrough for settlement or EDO staff</li>
            <li>Ask about listing this as a referral aid for your community</li>
          </ul>
        </div>
        <div className="contact-card">
          <h3>NOC Careers</h3>
          <p>Unofficial RCIP search — lists in, official portals out.</p>
          <dl>
            <div>
              <dt>Email</dt>
              <dd>
                <a href="mailto:info@noccareers.ca">info@noccareers.ca</a>
              </dd>
            </div>
            <div>
              <dt>Web</dt>
              <dd>
                <a href="https://noccareers.ca">noccareers.ca</a>
              </dd>
            </div>
            <div>
              <dt>Response</dt>
              <dd>We aim to reply within 2 business days</dd>
            </div>
          </dl>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-brand">
          <div className="logo footer-logo">
            <img
              className="logo-mark"
              src={img('noc-careers-logo.svg')}
              alt="NOC Careers"
              width={200}
              height={34}
            />
          </div>
          <p>
            Unofficial RCIP search for priority NOCs and designated employers.
          </p>
        </div>
        <div>
          <h3>Explore</h3>
          <a href="#about">How it works</a>
          <a href="#impact">Impact</a>
          <a href="#communities">Communities</a>
          <a href="#explore">Search</a>
          <a href="#next-steps">Next steps</a>
          <a href="#share">Share</a>
          <a href="#contact">Contact</a>
        </div>
        <div>
          <h3>Contact</h3>
          <a href="mailto:info@noccareers.ca">info@noccareers.ca</a>
          <a href="https://noccareers.ca">noccareers.ca</a>
          <p>
            Not affiliated with IRCC or WorkBC. Always confirm on the community RCIP website before you
            apply.
          </p>
        </div>
      </footer>
      </div>

      <button
        type="button"
        className={`scroll-top ${showScrollTop ? 'is-visible' : ''}`}
        aria-label="Scroll to top"
        onClick={scrollToTop}
      >
        <span aria-hidden="true">↑</span>
      </button>
    </>
  )
}
