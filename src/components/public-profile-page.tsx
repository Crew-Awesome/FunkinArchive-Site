import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { ImageOff, UserRound } from "lucide-react"
import { AccountContent } from "@/components/account-page"
import { ProfileResourceControls } from "@/components/profile-resource-controls"
import { ResourceTypePills } from "@/components/resource-type-pills"
import { StarMeter } from "@/components/resource-rating"
import { Button } from "@/components/ui/button"
import { fetchPublicProfile } from "@/data/public-profile-api"
import { getResourceTypes, type PublicProfile, type ResourceListing } from "@/data/resources"
import { profileInitials } from "@/lib/profile"
import { authClient } from "@/lib/auth-client"

const sortValues = ["newest", "oldest", "updated", "least-updated", "alphabetical", "reverse-alphabetical", "highest-rated", "most-rated"]

function PublicSubmissionCard({ resource }: { resource: ResourceListing }) {
  return (
    <Link className="resource-card-link" to={`/resources/${encodeURIComponent(resource.slug)}`}>
      <article className="resource-card">
        <div className="resource-art">
          {resource.coverUrl
            ? <img src={resource.coverUrl} alt={`Cover for ${resource.title}`} loading="lazy" decoding="async" />
            : <div className="resource-art-placeholder" role="img" aria-label={`No cover available for ${resource.title}`}><ImageOff size={22} /></div>}
          <ResourceTypePills types={getResourceTypes(resource)} />
        </div>
        <div className="resource-card-body">
          <h2 className="resource-card-title">{resource.title}</h2>
          {resource.ratingAverage != null && resource.ratingCount ? <p className="profile-resource-rating"><StarMeter value={resource.ratingAverage} /><span>{resource.ratingAverage.toFixed(1)} · {resource.ratingCount}</span></p> : null}
        </div>
      </article>
    </Link>
  )
}

export function PublicProfilePage() {
  const { username } = useParams<{ username: string }>()
  const [params, setParams] = useSearchParams()
  const { data: authData, isPending: sessionPending } = authClient.useSession()
  const [profile, setProfile] = useState<PublicProfile>()
  const [resources, setResources] = useState<ResourceListing[]>([])
  const [error, setError] = useState<string>()
  const [moreError, setMoreError] = useState<string>()
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadedRequestKey, setLoadedRequestKey] = useState("")
  const [retryCount, setRetryCount] = useState(0)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadMoreControllerRef = useRef<AbortController | null>(null)
  const loadingMoreRef = useRef(false)
  const queryParams = new URLSearchParams(params)
  queryParams.delete("page")
  queryParams.delete("limit")
  const queryString = queryParams.toString()
  const requestKey = `${username}:${queryString}:${retryCount}`
  const query = params.get("q") ?? ""
  const type = params.get("type") ?? "all"
  const minRating = params.get("minRating") ?? "all"
  const requestedSort = params.get("sort") ?? "newest"
  const sort = sortValues.includes(requestedSort) ? requestedSort : "newest"
  const loading = sessionPending || loadedRequestKey !== requestKey
  const activeError = loadedRequestKey === requestKey ? error : undefined
  const ownProfile = Boolean(profile && authData?.user?.id === profile.id)

  useEffect(() => {
    if (!username || sessionPending) return
    const controller = new AbortController()
    loadMoreControllerRef.current?.abort()
    loadingMoreRef.current = false
    setLoadingMore(false)
    setMoreError(undefined)
    setProfile(undefined)
    setResources([])
    const pageParams = new URLSearchParams(queryString)
    pageParams.set("page", "1")
    pageParams.set("limit", "24")
    const timeout = window.setTimeout(() => {
      void fetchPublicProfile(username, pageParams, controller.signal)
        .then((result) => { setProfile(result); setResources(result.resources); setError(undefined) })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return
          setError(cause instanceof Error ? cause.message : "The profile could not be loaded.")
        })
        .finally(() => { if (!controller.signal.aborted) setLoadedRequestKey(requestKey) })
    }, query ? 250 : 0)
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
      loadMoreControllerRef.current?.abort()
      loadMoreControllerRef.current = null
      loadingMoreRef.current = false
    }
  }, [username, sessionPending, query, queryString, requestKey])

  const loadMore = useCallback(async () => {
    if (!username || !profile || loading || loadingMoreRef.current || profile.page >= profile.pageCount) return
    const controller = new AbortController()
    loadMoreControllerRef.current = controller
    loadingMoreRef.current = true
    setLoadingMore(true)
    setMoreError(undefined)
    const pageParams = new URLSearchParams(queryString)
    pageParams.set("page", String(profile.page + 1))
    pageParams.set("limit", "24")
    try {
      const result = await fetchPublicProfile(username, pageParams, controller.signal)
      if (!controller.signal.aborted) {
        setResources((current) => {
          const loadedIds = new Set(current.map((resource) => resource.id))
          return [...current, ...result.resources.filter((resource) => !loadedIds.has(resource.id))]
        })
        setProfile(result)
      }
    } catch (cause: unknown) {
      if (cause instanceof DOMException && cause.name === "AbortError") return
      setMoreError(cause instanceof Error ? cause.message : "Could not load more resources.")
    } finally {
      if (!controller.signal.aborted) {
        loadingMoreRef.current = false
        loadMoreControllerRef.current = null
        setLoadingMore(false)
      }
    }
  }, [username, profile, loading, queryString])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !profile || loading || activeError || moreError || profile.page >= profile.pageCount || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore()
    }, { rootMargin: "600px 0px" })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [activeError, loadMore, loading, moreError, profile])

  useEffect(() => {
    document.title = ownProfile ? `${authData?.user?.name ?? "Profile"} - FunkinArchive` : profile ? `${profile.name} - FunkinArchive` : "Profile - FunkinArchive"
    return () => { document.title = "Browse - FunkinArchive" }
  }, [profile, ownProfile, authData?.user?.name])

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value && value !== "all" && !(key === "sort" && value === "newest")) next.set(key, value)
    else next.delete(key)
    next.delete("page")
    next.delete("limit")
    setParams(next, { replace: true })
  }

  function resetFilters() { setParams(new URLSearchParams(), { replace: true }) }

  if (loading && !profile) return <div className="public-profile-page" aria-busy="true"><p role="status">Loading profile…</p></div>
  if (ownProfile && authData?.user) return <AccountContent key={authData.user.id} user={authData.user} />
  if (activeError || !profile) {
    return <div className="public-profile-page"><section className="details-message" role="status"><h1>Profile unavailable</h1><p>{activeError ?? "This profile could not be found."}</p><Button variant="outline" render={<Link to="/" />}>Back to Browse</Button></section></div>
  }

  const noResults = profile.total === 0 && (query.trim().length > 0 || type !== "all" || minRating !== "all")

  return (
    <div className="public-profile-page">
      <section className="account-profile-card" aria-labelledby="public-profile-name">
        <div className="account-profile-banner">
          {profile.banner && <img src={profile.banner} alt="" />}
          <div className="account-profile-visual-content">
            <div className="account-avatar" aria-hidden="true">
              {profile.image ? <img src={profile.image} alt="" /> : profileInitials(profile.name) || <UserRound size={28} strokeWidth={1.6} />}
            </div>
            <div className="account-profile-visual-copy"><h1 id="public-profile-name">{profile.name}</h1><p className="account-profile-username">@{profile.username}</p></div>
          </div>
        </div>
        {profile.bio && <div className="account-profile-details-row"><p className="account-profile-bio">{profile.bio}</p></div>}
      </section>

      <section className="public-profile-submissions" aria-labelledby="public-profile-submissions-heading" aria-busy={loading || loadingMore}>
        <header className="public-profile-submissions-header">
          <h2 id="public-profile-submissions-heading">Submissions</h2>
          <span>{profile.total}</span>
        </header>
        <ProfileResourceControls query={query} type={type} minRating={minRating} sort={sort} types={profile.facets.types} onQueryChange={(value) => updateParam("q", value)} onChange={updateParam} onReset={resetFilters} />
        {activeError ? <div className="account-submissions-empty" role="alert"><p>{activeError}</p><Button variant="outline" onClick={() => setRetryCount((count) => count + 1)}>Retry</Button></div> : loading ? <div className="resource-grid" aria-label="Loading profile resources">{[0, 1, 2].map((index) => <div key={index} className="resource-card resource-card-skeleton" aria-hidden="true"><div className="skeleton-cover" /><div className="skeleton-lines"><span /><span /></div></div>)}</div> : resources.length > 0 ? <>
          <div className="resource-grid">{resources.map((resource) => <PublicSubmissionCard key={resource.id} resource={resource} />)}</div>
          <p className="infinite-scroll-count" role="status">Showing {resources.length} of {profile.total} resources</p>
          {profile.page < profile.pageCount && <>
            <div ref={sentinelRef} className="infinite-scroll-sentinel" aria-hidden="true" />
            <div className="infinite-scroll-controls">
              {loadingMore ? <p role="status">Loading more resources…</p> : moreError ? <div className="infinite-scroll-error" role="alert"><span>{moreError}</span><Button variant="outline" size="sm" onClick={() => void loadMore()}>Retry</Button></div> : <Button variant="outline" size="sm" onClick={() => void loadMore()}>Load more resources</Button>}
            </div>
          </>}
          {profile.page >= profile.pageCount && <p className="infinite-scroll-end" role="status">You’ve reached the end of the catalog.</p>}
        </> : <div className="account-submissions-empty"><p>{noResults ? "No resources match those filters." : "No resources submitted yet."}</p>{noResults && <Button variant="outline" onClick={resetFilters}>Clear search and filters</Button>}</div>}
      </section>
    </div>
  )
}
