import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import {
  AlertCircle,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  ImageOff,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react"
import { getResourceTypes, type ResourceListing, type ResourcesResponse, type SortOrder } from "@/data/resources"
import { fetchResources } from "@/data/resources-api"
import { ResourceTypePills } from "@/components/resource-type-pills"
import { StarMeter } from "@/components/resource-rating"
import { StarRatingFilter } from "@/components/star-rating-filter"
import { SubmitterHoverCard } from "@/components/submitter-hover-card"
import { ResourceTypeIcon } from "@/components/resource-type-icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function CoverArtwork({ resource }: { resource: ResourceListing }) {
  return (
    <div className="resource-art">
      {resource.coverUrl ? <img src={resource.coverUrl} alt={`Cover for ${resource.title}`} loading="lazy" decoding="async" /> : <div className="resource-art-placeholder" role="img" aria-label={`No cover available for ${resource.title}`}><ImageOff size={22} /></div>}
    </div>
  )
}

function ResourceCard({ resource }: { resource: ResourceListing }) {
  const [focused, setFocused] = useState(false)
  return (
    <Link className="resource-card-link" to={`/resources/${encodeURIComponent(resource.slug)}`} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} aria-describedby={focused ? `submitter-preview-${resource.id.replace(/[^a-zA-Z0-9_-]/g, "-")}` : undefined}>
      <article className="resource-card browse-resource-card">
        <CoverArtwork resource={resource} />
        <SubmitterHoverCard
          userId={resource.submittedByUserId}
          name={resource.submittedBy}
          image={resource.submittedByImage}
          previewId={`submitter-preview-${resource.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`}
          className="resource-submitter-preview"
          focused={focused}
        >
          <span className="resource-submitter-avatar" role="img" aria-label={`Submitted by ${resource.submittedBy}`}>
            {resource.submittedByImage ? <img src={resource.submittedByImage} alt="" loading="lazy" /> : resource.submittedBy.slice(0, 1).toUpperCase()}
          </span>
        </SubmitterHoverCard>
        <div className="resource-card-body">
          <div className="resource-card-heading">
            <div className="resource-card-title-row">
              <h2 className="resource-card-title">{resource.title}</h2>
              <ResourceTypePills className="resource-type-pills-card" types={getResourceTypes(resource)} />
            </div>
          </div>
          {resource.ratingAverage != null && resource.ratingCount ? <p className="profile-resource-rating"><StarMeter value={resource.ratingAverage} /><span>{resource.ratingAverage.toFixed(1)} · {resource.ratingCount}</span></p> : null}
          <p className="resource-card-submitted">Original By <span>{resource.originalBy?.trim() || "Not listed"}</span></p>
        </div>
      </article>
    </Link>
  )
}

function SelectField({ label, value, options, onChange, typeOptions = false, allLabel }: { label: string; value: string; options: string[]; onChange: (value: string) => void; typeOptions?: boolean; allLabel?: string }) {
  return (
    <label className="filter-field">
      <span className="sr-only">{label}</span>
      <Select<string> value={value} onValueChange={(next) => { if (next) onChange(next) }}>
        <SelectTrigger aria-label={label}>
          {typeOptions && value !== "all" && <ResourceTypeIcon type={value} />}
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{allLabel ?? `All ${label.toLowerCase()}s`}</SelectItem>
          {options.map((option) => <SelectItem key={option} value={option}>{typeOptions && <ResourceTypeIcon type={option} />}{label === "Minimum rating" ? `${option}${option === "5" ? " stars" : "+ stars"}` : option}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  )
}

function BrowseFilters({ facets, type, minRating, onTypeChange, onRatingChange }: {
  facets: ResourcesResponse["facets"]
  type: string
  minRating: string
  onTypeChange: (value: string) => void
  onRatingChange: (value: string) => void
}) {
  return (
    <div className="filter-selects">
      <SelectField label="Type" value={type} options={facets.types} onChange={onTypeChange} typeOptions />
      <StarRatingFilter value={minRating === "all" ? null : Number(minRating)} onChange={(value) => onRatingChange(value == null ? "all" : String(value))} />
    </div>
  )
}

function BrowseEmptyState({ noResults, onReset }: { noResults: boolean; onReset: () => void }) {
  return (
    <div className="browse-empty" role="status">
      <span className="empty-icon"><Search size={19} /></span>
      <h2>{noResults ? "No resources match those filters" : "No resources in the catalog yet"}</h2>
      <p>{noResults ? "Try a different search or clear some filters." : "Resources will appear here once catalog records are added."}</p>
      {noResults && <Button variant="outline" size="sm" onClick={onReset}><X size={14} />Clear search and filters</Button>}
    </div>
  )
}

function BrowseErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="browse-empty" role="alert">
      <span className="empty-icon"><AlertCircle size={19} /></span>
      <h2>Couldn’t load the catalog</h2>
      <p>{error}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
    </div>
  )
}

function ResourceGridSkeleton() {
  return <div className="resource-grid" aria-label="Loading resources">{Array.from({ length: 6 }, (_, index) => <div className="resource-card resource-card-skeleton" key={index} aria-hidden="true"><div className="skeleton-cover" /><div className="skeleton-lines"><span /><span /><span /></div></div>)}</div>
}

function emptyFacets(): ResourcesResponse["facets"] {
  return { types: [] }
}

export function BrowsePage() {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<ResourcesResponse>()
  const [resources, setResources] = useState<ResourceListing[]>([])
  const [error, setError] = useState<string>()
  const [moreError, setMoreError] = useState<string>()
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadedRequestKey, setLoadedRequestKey] = useState<string>()
  const [retryCount, setRetryCount] = useState(0)
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
  const loadMoreControllerRef = useRef<AbortController | null>(null)
  const loadingMoreRef = useRef(false)
  const requestParams = new URLSearchParams(params)
  requestParams.delete("page")
  requestParams.delete("status")
  const queryString = requestParams.toString()
  const requestKey = `${queryString}:${retryCount}`
  const query = params.get("q") ?? ""
  const type = params.get("type") ?? params.get("fileType") ?? params.get("category") ?? "all"
  const minRating = params.get("minRating") ?? "all"
  const sortParam = params.get("sort")
  const validSortOrders: SortOrder[] = ["newest", "oldest", "updated", "least-updated", "alphabetical", "reverse-alphabetical", "highest-rated", "lowest-rated", "most-rated", "fewest-ratings"]
  const sortOrder: SortOrder = validSortOrders.includes(sortParam as SortOrder) ? sortParam as SortOrder : "newest"
  const loading = loadedRequestKey !== requestKey
  const activeError = loadedRequestKey === requestKey ? error : undefined

  useEffect(() => {
    if (!params.has("status") && !params.has("page")) return
    const next = new URLSearchParams(params)
    next.delete("status")
    next.delete("page")
    setParams(next, { replace: true })
  }, [params, setParams])

  useEffect(() => {
    const controller = new AbortController()
    loadMoreControllerRef.current?.abort()
    loadingMoreRef.current = false
    setLoadingMore(false)
    setMoreError(undefined)
    setData(undefined)
    setResources([])
    const timeout = window.setTimeout(() => {
      const pageParams = new URLSearchParams(queryString)
      pageParams.set("page", "1")
      pageParams.set("limit", "24")
      fetchResources(pageParams, controller.signal)
        .then((result) => { setData(result); setResources(result.resources); setError(undefined) })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return
          setError(cause instanceof Error ? cause.message : "An unexpected error occurred.")
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
  }, [query, queryString, requestKey])

  const loadMore = useCallback(async () => {
    if (!data || loading || loadingMoreRef.current || data.page >= data.pageCount) return

    const controller = new AbortController()
    loadMoreControllerRef.current = controller
    loadingMoreRef.current = true
    setLoadingMore(true)
    setMoreError(undefined)

    const pageParams = new URLSearchParams(queryString)
    pageParams.set("page", String(data.page + 1))
    pageParams.set("limit", "24")

    try {
      const result = await fetchResources(pageParams, controller.signal)
      if (!controller.signal.aborted) {
        setResources((current) => {
          const loadedIds = new Set(current.map((resource) => resource.id))
          return [...current, ...result.resources.filter((resource) => !loadedIds.has(resource.id))]
        })
        setData(result)
      }
    } catch (cause: unknown) {
      if (cause instanceof DOMException && cause.name === "AbortError") return
      setMoreError(cause instanceof Error ? cause.message : "An unexpected error occurred.")
    } finally {
      if (!controller.signal.aborted) {
        loadingMoreRef.current = false
        loadMoreControllerRef.current = null
        setLoadingMore(false)
      }
    }
  }, [data, loading, queryString])

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current
    if (!sentinel || !data || loading || activeError || moreError || data.page >= data.pageCount || typeof IntersectionObserver === "undefined") return

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore()
    }, { rootMargin: "600px 0px" })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [activeError, data, loadMore, loading, moreError])

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value && value !== "all" && !(key === "sort" && value === "newest")) next.set(key, value)
    else next.delete(key)
    next.delete("page")
    setParams(next, { replace: true })
  }
  const updateType = (value: string) => {
    const next = new URLSearchParams(params)
    next.delete("category")
    next.delete("fileType")
    if (value && value !== "all") next.set("type", value)
    else next.delete("type")
    setParams(next, { replace: true })
  }
  const updateRating = (value: string) => updateParam("minRating", value)
  const resetFilters = () => setParams(new URLSearchParams(), { replace: true })
  const activeFilterCount = Number(type !== "all") + Number(minRating !== "all")
  const facets = data?.facets ?? emptyFacets()
  const noResults = data?.total === 0 && (query.trim().length > 0 || type !== "all" || minRating !== "all")
  const sortDirections = {
    added: { ascending: "oldest", descending: "newest" },
    updated: { ascending: "least-updated", descending: "updated" },
    title: { ascending: "alphabetical", descending: "reverse-alphabetical" },
    rating: { ascending: "lowest-rated", descending: "highest-rated" },
    ratings: { ascending: "fewest-ratings", descending: "most-rated" },
  } as const
  const sortBy = (Object.entries(sortDirections).find(([, directions]) => directions.ascending === sortOrder || directions.descending === sortOrder)?.[0] ?? "added") as keyof typeof sortDirections
  const ascendingSort = sortOrder === "oldest" || sortOrder === "least-updated" || sortOrder === "reverse-alphabetical" || sortOrder === "lowest-rated" || sortOrder === "fewest-ratings"

  return (
    <div className="browse-page">
      <div className="browse-toolbar">
      <search className="browse-search-area">
        <label className="sr-only" htmlFor="browse-search">Search resources by title, creator, or tag</label>
        <Search className="search-icon" size={18} aria-hidden="true" />
        <Input id="browse-search" className="browse-search-input" value={query} onChange={(event) => updateParam("q", event.target.value)} placeholder="Search resources, creators, and tags" autoComplete="off" />
        {query && <Button className="search-clear" variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => updateParam("q", "")}><X size={16} /></Button>}
      </search>

      <section className="browse-controls" aria-label="Browse controls">
        <div className="desktop-filter-controls">
          <BrowseFilters facets={facets} type={type} minRating={minRating} onTypeChange={updateType} onRatingChange={updateRating} />
        </div>
        <div className="browse-control-actions">
          <Sheet>
            <SheetTrigger className="mobile-filter-trigger" render={<Button variant="outline" size="sm" />}>
              <SlidersHorizontal size={15} /> Filters{activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
            </SheetTrigger>
            <SheetContent side="right" className="mobile-filter-sheet">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              <SheetDescription>Refine by resource type or minimum star rating. Search also checks tags.</SheetDescription>
              </SheetHeader>
              <div className="mobile-filter-fields">
                <BrowseFilters facets={facets} type={type} minRating={minRating} onTypeChange={updateType} onRatingChange={updateRating} />
              </div>
              <div className="mobile-filter-footer"><Button variant="outline" onClick={resetFilters}>Reset filters</Button></div>
            </SheetContent>
          </Sheet>
          <div className="sort-field">
            <span className="sr-only">Sort resources</span>
            <Button className="sort-direction" variant="outline" size="icon-sm" aria-label={`Switch to ${ascendingSort ? "descending" : "ascending"} order`} title={`Switch to ${ascendingSort ? "descending" : "ascending"} order`} onClick={() => updateParam("sort", sortDirections[sortBy][ascendingSort ? "descending" : "ascending"])}>
              {ascendingSort ? <ArrowUpWideNarrow size={15} aria-hidden="true" /> : <ArrowDownWideNarrow size={15} aria-hidden="true" />}
            </Button>
            <Select value={sortBy} onValueChange={(value) => { if (value && value in sortDirections) updateParam("sort", sortDirections[value as keyof typeof sortDirections].descending) }}>
            <SelectTrigger aria-label="Sort resources"><SelectValue /></SelectTrigger>
              <SelectContent className="sort-menu">
                <SelectItem value="added">Added</SelectItem>
                <SelectItem value="updated">Updated</SelectItem>
                <SelectItem value="title">Title</SelectItem>
                <SelectItem value="rating">Rating</SelectItem>
                <SelectItem value="ratings">Ratings</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {activeFilterCount > 0 && <Button className="desktop-reset" variant="ghost" size="sm" onClick={resetFilters}>Clear filters</Button>}
        </div>
      </section>
      </div>

      <section className="results-section" aria-label="Browse results" aria-busy={loading || loadingMore}>
        {activeFilterCount > 0 && <p className="results-filter-summary">{activeFilterCount} {activeFilterCount === 1 ? "filter" : "filters"} applied</p>}
        {loading ? <ResourceGridSkeleton /> : activeError ? <BrowseErrorState error={activeError} onRetry={() => setRetryCount((count) => count + 1)} /> : resources.length ? <div className="resource-grid">{resources.map((resource) => <ResourceCard key={resource.id} resource={resource} />)}</div> : <BrowseEmptyState noResults={noResults} onReset={resetFilters} />}
        {!loading && !activeError && data && resources.length > 0 && <p className="infinite-scroll-count" role="status">Showing {resources.length} of {data.total} resources</p>}
        {!loading && !activeError && data && data.page < data.pageCount && (
          <>
            <div ref={loadMoreSentinelRef} className="infinite-scroll-sentinel" aria-hidden="true" />
            <div className="infinite-scroll-controls">
              {loadingMore ? <p role="status">Loading more resources…</p> : moreError ? <div className="infinite-scroll-error" role="alert"><span>{moreError}</span><Button variant="outline" size="sm" onClick={() => void loadMore()}>Retry</Button></div> : <Button variant="outline" size="sm" onClick={() => void loadMore()}>Load more resources</Button>}
            </div>
          </>
        )}
        {!loading && !activeError && data && data.page >= data.pageCount && resources.length > 0 && <p className="infinite-scroll-end" role="status">You’ve reached the end of the catalog.</p>}
      </section>
    </div>
  )
}
