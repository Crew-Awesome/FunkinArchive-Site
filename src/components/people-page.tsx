import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ImageOff, Search, UserRound, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fetchPeople, personCoverUrl, type PeopleResponse, type PersonListing } from "@/data/people-api"
import { profileInitials } from "@/lib/profile"

function PersonCard({ person }: { person: PersonListing }) {
  const cover = personCoverUrl(person)
  return (
    <li className="people-grid-item">
      <Link className="people-card-link" to={`/users/${encodeURIComponent(person.username ?? person.id)}`}>
        <article className="people-card">
          <div className="people-card-banner">
            {cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : <span className="people-card-banner-placeholder" aria-hidden="true"><ImageOff size={21} /></span>}
          </div>
          <div className="people-card-body">
            <span className="people-card-avatar" aria-hidden="true">
              {person.image ? <img src={person.image} alt="" loading="lazy" decoding="async" /> : profileInitials(person.name) || <UserRound size={21} />}
            </span>
            <div className="people-card-heading">
              <h2>{person.name}</h2>
              {person.username && <span>@{person.username}</span>}
            </div>
            <p className={`people-card-description${person.bio ? "" : " is-latest"}`}>
              {person.bio || (person.latestResourceTitle ? `Latest: ${person.latestResourceTitle}` : "No bio added yet.")}
            </p>
            <p className="people-card-count"><strong>{person.submissionCount.toLocaleString()}</strong> {person.submissionCount === 1 ? "resource" : "resources"}</p>
          </div>
        </article>
      </Link>
    </li>
  )
}

function PeopleSkeleton() {
  return <ul className="people-grid" aria-label="Loading people">{Array.from({ length: 6 }, (_, index) => <li className="people-card people-card-skeleton" key={index} aria-hidden="true"><span /><div><i /><i /><i /></div></li>)}</ul>
}

export function PeoplePage() {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<PeopleResponse>()
  const [people, setPeople] = useState<PersonListing[]>([])
  const [error, setError] = useState<string>()
  const [moreError, setMoreError] = useState<string>()
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadedRequestKey, setLoadedRequestKey] = useState("")
  const [retryCount, setRetryCount] = useState(0)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadControllerRef = useRef<AbortController | null>(null)
  const loadingMoreRef = useRef(false)
  const query = params.get("q") ?? ""
  const requestedSort = params.get("sort")
  const sort = requestedSort === "all" || requestedSort === "recent" ? requestedSort : "contributors"
  const requestParams = new URLSearchParams(params)
  requestParams.delete("page")
  const queryString = requestParams.toString()
  const requestKey = `${queryString}:${retryCount}`
  const loading = loadedRequestKey !== requestKey
  const activeError = loadedRequestKey === requestKey ? error : undefined

  useEffect(() => {
    const controller = new AbortController()
    loadControllerRef.current?.abort()
    loadingMoreRef.current = false
    setLoadingMore(false)
    setMoreError(undefined)
    setData(undefined)
    setPeople([])
    const timeout = window.setTimeout(() => {
      const pageParams = new URLSearchParams(queryString)
      pageParams.set("page", "1")
      pageParams.set("limit", "24")
      fetchPeople(pageParams, controller.signal)
        .then((result) => { setData(result); setPeople(result.people); setError(undefined) })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return
          setError(cause instanceof Error ? cause.message : "People could not be loaded. Try again.")
        })
        .finally(() => { if (!controller.signal.aborted) setLoadedRequestKey(requestKey) })
    }, query ? 250 : 0)
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
      loadControllerRef.current?.abort()
      loadControllerRef.current = null
      loadingMoreRef.current = false
    }
  }, [query, queryString, requestKey])

  const loadMore = useCallback(async () => {
    if (!data || loading || loadingMoreRef.current || data.page >= data.pageCount) return
    const controller = new AbortController()
    loadControllerRef.current = controller
    loadingMoreRef.current = true
    setLoadingMore(true)
    setMoreError(undefined)
    const pageParams = new URLSearchParams(queryString)
    pageParams.set("page", String(data.page + 1))
    pageParams.set("limit", "24")
    try {
      const result = await fetchPeople(pageParams, controller.signal)
      if (!controller.signal.aborted) {
        setPeople((current) => {
          const loadedIds = new Set(current.map((person) => person.id))
          return [...current, ...result.people.filter((person) => !loadedIds.has(person.id))]
        })
        setData(result)
      }
    } catch (cause: unknown) {
      if (cause instanceof DOMException && cause.name === "AbortError") return
      setMoreError(cause instanceof Error ? cause.message : "People could not be loaded. Try again.")
    } finally {
      if (!controller.signal.aborted) {
        loadingMoreRef.current = false
        loadControllerRef.current = null
        setLoadingMore(false)
      }
    }
  }, [data, loading, queryString])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !data || loading || activeError || moreError || data.page >= data.pageCount || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore()
    }, { rootMargin: "600px 0px" })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [activeError, data, loadMore, loading, moreError])

  function updateParam(key: "q" | "sort", value: string) {
    const next = new URLSearchParams(params)
    if (value && !(key === "sort" && value === "contributors")) next.set(key, value)
    else next.delete(key)
    next.delete("page")
    setParams(next, { replace: true })
  }

  return (
    <div className="people-page">
      <h1 className="sr-only">People</h1>

      <div className="people-toolbar">
        <search className="people-search">
          <label className="sr-only" htmlFor="people-search-input">Search people by name, username, or bio</label>
          <Search size={18} aria-hidden="true" />
          <Input id="people-search-input" type="search" name="q" value={query} onChange={(event) => updateParam("q", event.currentTarget.value)} placeholder="Search people" autoComplete="off" autoCapitalize="none" spellCheck={false} />
          {query && <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear people search" onClick={() => updateParam("q", "")}><X size={16} aria-hidden="true" /></Button>}
        </search>
        <label className="people-sort">
          <span className="sr-only">Sort people</span>
          <Select value={sort} onValueChange={(value) => { if (value) updateParam("sort", value) }}>
            <SelectTrigger aria-label="Sort people"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All people</SelectItem><SelectItem value="contributors">Most resources</SelectItem><SelectItem value="recent">Recently active</SelectItem></SelectContent>
          </Select>
        </label>
      </div>

      <section className="people-results" aria-label="People" aria-busy={loading || loadingMore}>
        {loading ? <PeopleSkeleton /> : activeError ? <div className="people-state" role="alert"><p>{activeError}</p><Button variant="outline" size="sm" onClick={() => setRetryCount((count) => count + 1)}>Retry</Button></div> : people.length ? <>
          <ul className="people-grid" aria-label="People">
            {people.map((person) => <PersonCard key={person.id} person={person} />)}
          </ul>
          {data && data.page < data.pageCount && <>
            <div ref={sentinelRef} className="infinite-scroll-sentinel" aria-hidden="true" />
            <div className="infinite-scroll-controls">
              {loadingMore ? <p role="status">Loading more people…</p> : moreError ? <div className="infinite-scroll-error" role="alert"><span>{moreError}</span><Button variant="outline" size="sm" onClick={() => void loadMore()}>Retry</Button></div> : <Button variant="outline" size="sm" onClick={() => void loadMore()}>Load more people</Button>}
            </div>
          </>}
        </> : <div className="people-state"><div className="people-empty-mark" aria-hidden="true"><Search size={20} /></div><h2>{query ? "No people found" : sort === "all" ? "No accounts yet" : "No contributors yet"}</h2><p>{query ? "Try another name or username." : sort === "all" ? "People will appear here when they create an account." : "People will appear here when they share public resources."}</p>{query && <Button variant="outline" size="sm" onClick={() => updateParam("q", "")}>Clear search</Button>}</div>}
      </section>
    </div>
  )
}
