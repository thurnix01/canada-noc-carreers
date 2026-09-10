import { useDeferredValue, useEffect, useMemo, useRef, useState, startTransition } from 'react'
import type { Listing, ListingType, ListingsPayload } from './types'
import { matchesQuery, typeLabel, withUtm } from './lib'
import './index.css'

const TYPE_OPTIONS: { value: '' | ListingType; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'priority_noc', label: 'Eligible NOCs' },
  { value: 'employer', label: 'Designated employers' },
  { value: 'job', label: 'Open roles' },
]

const img = (name: string) => `${import.meta.env.BASE_URL}images/${name}`

function ResultCard({ listing, index }: { listing: Listing; index: number }) {
  const primary = withUtm(listing.source_url || listing.portal_url, listing.community_id, listing.type)
  const jobsLink = listing.jobs_url
    ? withUtm(listing.jobs_url, listing.community_id, 'find-job')
    : ''

  return (
    <article className="card" style={{ animationDelay: `${Math.min(index, 16) * 0.035}s` }}>
      <div className="card-top">
        <div className="card-tags">
          <span className={`badge type-${listing.type}`}>{typeLabel(listing.type)}</span>
          <span className="badge">
            {listing.community_name}
            {listing.province ? `, ${listing.province}` : ''}
          </span>
        </div>
        {listing.noc_code ? <span className="noc">NOC {listing.noc_code}</span> : null}
      </div>
      <h3>{listing.title}</h3>
      {listing.sector ? <p className="card-meta">{listing.sector}</p> : null}
      {listing.locations ? <p className="card-meta">{listing.locations}</p> : null}
      {listing.type === 'employer' ? (
        <p className="card-tip">Designated ≠ hiring. Apply only to publicly posted jobs.</p>
      ) : null}
      {listing.notes && listing.type === 'priority_noc' ? (
        <p className="card-tip">{listing.notes}</p>
      ) : null}
      <div className="actions">
        {primary ? (
          <a className="btn btn-primary" href={primary} target="_blank" rel="noreferrer noopener">
            View official source
            <span aria-hidden="true">↗</span>
          </a>
        ) : null}
        {jobsLink ? (
          <a className="btn btn-ghost" href={jobsLink} target="_blank" rel="noreferrer noopener">
            Job guidance
          </a>
        ) : null}
        {listing.portal_url && listing.portal_url !== listing.source_url ? (
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

export default function App() {
  const [data, setData] = useState<ListingsPayload | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [community, setCommunity] = useState('')
  const [type, setType] = useState<'' | ListingType>('')
  const deferredQuery = useDeferredValue(query)
  const exploreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    document.documentElement.style.setProperty('--topo-image', `url(${img('topo-light.jpg')})`)
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
    return data.listings.filter((item) => {
      if (community && item.community_id !== community) return false
      if (type && item.type !== type) return false
      return matchesQuery(item, deferredQuery)
    })
  }, [data, community, type, deferredQuery])

  const hasFilters = Boolean(deferredQuery || community || type)

  const scrollToExplore = () => {
    exploreRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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
      <div className="site-header">
        <div className="shell header-inner">
          <div className="topbar">
            <span>Rural Community Immigration Pilot · British Columbia</span>
            <span>Unofficial search aid — verify on official portals</span>
          </div>

          <header className="nav">
            <a className="logo" href="#top">
              <img
                className="logo-mark"
                src={img('noc-careers-logo.svg')}
                alt="NOC Careers"
                width={220}
                height={37}
              />
            </a>
            <nav className="nav-links" aria-label="Primary">
              <a href="#about">About</a>
              <a href="#communities">Communities</a>
              <a href="#explore">Explore</a>
              <a href="#support">Guidance</a>
            </nav>
            <button type="button" className="btn btn-primary nav-cta" onClick={scrollToExplore}>
              Search listings
            </button>
          </header>

          <section className="hero" id="top">
            <div className="hero-copy">
              <p className="pill">Build your future in rural Canada</p>
              <h1>
                Priority NOCs &amp; employers for <span>RCIP communities</span>
              </h1>
              <p className="lede">
                Find eligible occupations and designated employers, then continue on the official community
                portal. Unofficial search aid — always verify on the source site.
              </p>
              <div className="hero-actions">
                <button type="button" className="btn btn-primary btn-lg" onClick={scrollToExplore}>
                  Start searching
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
                  <strong>BC pilot focus</strong>
                  <span>{data.counts.communities} RCIP communities</span>
                </div>
              </div>
              <div className="stat-card">
                <strong>{data.counts.employers.toLocaleString()}+</strong>
                <span>designated employers</span>
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
            <button type="submit" className="btn btn-dark btn-lg dock-submit">
              Check listings
            </button>
          </form>
        </div>
      </div>

      <div className="shell shell-main">
      <section className="split about" id="about">
        <div className="collage" aria-hidden="true">
          <img src={img('workers.jpg')} alt="" className="collage-main" />
          <img src={img('farmers.jpg')} alt="" className="collage-top" />
          <img src={img('rural-team.jpg')} alt="" className="collage-bot" />
        </div>
        <div className="split-copy">
          <p className="pill">Welcome to NOC Careers</p>
          <h2>A clearer path from NOC code to community portal</h2>
          <p>
            RCIP job offers and priority occupations live on community economic development sites — not a
            single federal list. We aggregate what those portals publish so candidates can explore faster,
            then verify and apply on the official source.
          </p>
          <ul className="feature-list">
            <li>
              <span className="feat-icon" aria-hidden="true">
                ✓
              </span>
              <div>
                <strong>Priority NOCs first</strong>
                <p>See which occupations each pilot community is actively prioritizing.</p>
              </div>
            </li>
            <li>
              <span className="feat-icon" aria-hidden="true">
                ✓
              </span>
              <div>
                <strong>Designated employers, labelled clearly</strong>
                <p>Find who is designated — then only apply to publicly advertised roles.</p>
              </div>
            </li>
            <li>
              <span className="feat-icon" aria-hidden="true">
                ✓
              </span>
              <div>
                <strong>Always link out</strong>
                <p>Every result points back to the community portal or source document.</p>
              </div>
            </li>
          </ul>
          <button type="button" className="btn btn-primary" onClick={scrollToExplore}>
            Explore listings
          </button>
        </div>
      </section>

      <section className="communities" id="communities">
        <div className="section-head">
          <p className="pill">All RCIP communities</p>
          <h2>Browse every Rural Community Immigration Pilot region</h2>
          <p>
            BC listings are searchable here. Other communities are directory cards — open the official
            portal, or filter the explorer when data is available.
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
            <img src={img('friends-flags.jpg')} alt="" />
            <div>
              <strong>All communities</strong>
              <span>
                {data.counts.communities} regions · {data.counts.total} listings
              </span>
            </div>
          </button>
          {communityStats.map((c, i) => {
            const photos = ['security.jpg', 'rural-team.jpg', 'farmers.jpg', 'workers.jpg', 'citizens.jpg'] as const
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
                  <img src={img(photos[i % photos.length])} alt="" />
                  <div>
                    <strong>
                      {c.name}
                      <em>{c.province}</em>
                    </strong>
                    <span>
                      {c.directoryOnly
                        ? 'Directory — open official portal'
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
          <p className="pill">Live listings</p>
          <h2>Explore priority NOCs &amp; designated employers</h2>
          <p>
            Updated {new Date(data.generated_at).toLocaleString()} · {filtered.length.toLocaleString()}{' '}
            shown{hasFilters ? ' (filtered)' : ''}
          </p>
        </div>

        <div className="workspace">
          <aside className="sidebar" aria-label="Refine results">
            <div className="sidebar-card">
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
                Unofficial search aid — not affiliated with IRCC or community economic development offices.
                Do not mass-email designated employers; apply only to publicly advertised jobs. Always
                verify on the source site.
              </p>
            </div>
          </aside>

          <main className="results" aria-live="polite">
            {filtered.length === 0 ? (
              <p className="empty">
                {community && communityStats.find((c) => c.id === community)?.directoryOnly
                  ? 'No searchable listings for this community yet — use Official portal on the community card, then verify on the source site.'
                  : 'No matches. Try another NOC code or clear filters.'}
              </p>
            ) : (
              <div className="list">
                {filtered.slice(0, 200).map((listing, index) => (
                  <ResultCard key={listing.id} listing={listing} index={index} />
                ))}
              </div>
            )}
            {filtered.length > 200 ? (
              <p className="empty truncate-note">
                Showing first 200 of {filtered.length.toLocaleString()}. Narrow your search for more.
              </p>
            ) : null}
          </main>
        </div>
      </section>

      <section className="support" id="support">
        <div className="support-media">
          <img
            src={img('citizens.jpg')}
            alt="Community members wearing patriotic pins at a civic event"
            width={900}
            height={400}
          />
          <div className="stat-float">
            <strong>{data.counts.communities}</strong>
            <span>RCIP communities in this build</span>
          </div>
        </div>
        <div className="support-copy">
          <p className="pill">Candidate guidance</p>
          <h2>Use this tool to orient — then apply where jobs are posted</h2>
          <p>
            Designated employer lists are not open invitation lists. Mass outreach hurts candidates and
            communities. Treat every card as a pointer to the official page, then follow that community’s
            process.
          </p>
          <div className="info-box">
            <strong>Before you apply</strong>
            <ul>
              <li>Confirm the NOC is still on the community’s current priority list.</li>
              <li>Confirm the employer is designated for the role you want.</li>
              <li>Apply only through publicly advertised postings or the portal’s job guidance.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="cta-banner">
        <div className="cta-copy">
          <h2>Ready to check a NOC or employer?</h2>
          <p>Jump back to the explorer and open the official community source in one click.</p>
          <button type="button" className="btn btn-light btn-lg" onClick={scrollToExplore}>
            Open explorer
          </button>
        </div>
        <img src={img('friends-flags.jpg')} alt="" className="cta-photo" />
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
            Unofficial RCIP aggregator for priority NOCs and designated employers. Data refreshes when
            exported from Google Sheets / n8n.
          </p>
        </div>
        <div>
          <h3>Explore</h3>
          <a href="#about">About</a>
          <a href="#communities">Communities</a>
          <a href="#explore">Listings</a>
        </div>
        <div>
          <h3>Remember</h3>
          <p>Not affiliated with IRCC. Always verify on the community portal before applying.</p>
        </div>
      </footer>
      </div>
    </>
  )
}
