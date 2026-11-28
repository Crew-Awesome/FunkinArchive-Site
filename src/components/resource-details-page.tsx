import { useEffect, useId, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft, Download, Flag, ImageOff, Pencil } from "lucide-react"
import { clearResourceRating, fetchResource, fetchResourceRating, saveResourceRating } from "@/data/resources-api"
import { getResourceTypes, type ResourceListing, type ResourceRating } from "@/data/resources"
import { ResourceTypePills } from "@/components/resource-type-pills"
import { SubmitterHoverCard } from "@/components/submitter-hover-card"
import { StarMeter, StarRatingInput } from "@/components/resource-rating"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"
import { ResourceReportDialog } from "@/components/resource-report-dialog"

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)
}

export function ResourceDetailsPage() {
  const { slug } = useParams<{ slug: string }>()
  const { data: authData, isPending: authPending } = authClient.useSession()
  const [resource, setResource] = useState<ResourceListing>()
  const [error, setError] = useState<string>()
  const [loadedSlug, setLoadedSlug] = useState<string>()
  const loading = loadedSlug !== slug
  const activeError = loadedSlug === slug ? error : undefined
  const [rating, setRating] = useState<ResourceRating>()
  const [ratingLoadedSlug, setRatingLoadedSlug] = useState<string>()
  const [ratingError, setRatingError] = useState("")
  const [ratingPending, setRatingPending] = useState(false)
  const [submitterFocused, setSubmitterFocused] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const profilePreviewId = useId()

  useEffect(() => {
    if (!slug) return
    const controller = new AbortController()
    fetchResource(slug, controller.signal)
      .then((result) => { setResource(result); setError(undefined) })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return
        setError(cause instanceof Error ? cause.message : "An unexpected error occurred.")
      })
      .finally(() => { if (!controller.signal.aborted) setLoadedSlug(slug) })
    return () => controller.abort()
  }, [slug])

  useEffect(() => {
    if (!slug) return
    const controller = new AbortController()
    fetchResourceRating(slug, controller.signal)
      .then((result) => { setRating(result); setRatingError("") })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return
        setRatingError(cause instanceof Error ? cause.message : "Ratings could not be loaded.")
      })
      .finally(() => { if (!controller.signal.aborted) setRatingLoadedSlug(slug) })
    return () => controller.abort()
  }, [slug])

  async function submitRating(value: number) {
    if (!slug) return
    setRatingPending(true)
    setRatingError("")
    try {
      setRating(await saveResourceRating(slug, value))
    } catch (cause) {
      setRatingError(cause instanceof Error ? cause.message : "Your rating could not be saved.")
    } finally {
      setRatingPending(false)
    }
  }

  async function removeRating() {
    if (!slug) return
    setRatingPending(true)
    setRatingError("")
    try {
      setRating(await clearResourceRating(slug))
    } catch (cause) {
      setRatingError(cause instanceof Error ? cause.message : "Your rating could not be removed.")
    } finally {
      setRatingPending(false)
    }
  }

  return (
    <div className="resource-details-page">
      <Button className="details-back" variant="ghost" size="sm" render={<Link to="/" />}><ArrowLeft size={15} />Back to Browse</Button>
      {loading ? (
        <div className="details-loading" role="status">Loading resource…</div>
      ) : activeError ? (
        <section className="details-message" role="status"><h1>Resource unavailable</h1><p>{activeError}</p></section>
      ) : resource ? (
        <article className="resource-details">
          <div className="details-cover">
            {resource.coverUrl ? <img src={resource.coverUrl} alt={`Cover for ${resource.title}`} /> : <div className="resource-art-placeholder" role="img" aria-label={`No cover available for ${resource.title}`}><ImageOff size={28} /></div>}
            <ResourceTypePills types={getResourceTypes(resource)} />
          </div>
          <div className="details-content">
            <div className="details-heading">
              <h1>{resource.title}</h1>
              {resource.submittedByUserId === authData?.user?.id && <Button variant="outline" size="sm" render={<Link to={`/resources/${encodeURIComponent(resource.slug)}/edit`} />}><Pencil size={14} />Edit</Button>}
            </div>
            {resource.description && <p className="details-description">{resource.description}</p>}
            <section className="details-rating" aria-label="Resource rating">
              <div className="details-rating-summary">
                {ratingLoadedSlug === slug && rating
                  ? <div className="details-rating-score"><StarMeter value={rating.average ?? 0} /><span>{rating.average == null ? "No ratings yet" : `${rating.average.toFixed(1)} from ${rating.count} ${rating.count === 1 ? "rating" : "ratings"}`}</span></div>
                  : <p>{ratingLoadedSlug === slug ? "Rating unavailable" : "Loading rating…"}</p>}
              </div>
              <div className="details-rating-action">
                {authData?.user && authData.user.id !== resource.submittedByUserId && ratingLoadedSlug === slug && rating
                  ? <div className="details-rating-vote">
                      <span>Your rating</span>
                      <StarRatingInput value={rating.userRating} disabled={ratingPending} onChange={(value) => { void submitRating(value) }} />
                      {rating.userRating != null && <Button variant="ghost" size="sm" disabled={ratingPending} onClick={() => { void removeRating() }}>Clear</Button>}
                    </div>
                  : !authPending && !authData?.user && <Button variant="outline" size="sm" render={<Link to="/login" />}>Log in to rate</Button>}
              </div>
              {ratingError && <p className="details-rating-error" role="alert">{ratingError}</p>}
            </section>
            <dl className="details-metadata">
              <div className="details-meta-submitter"><dt>Submitted By</dt><dd>
                {resource.submittedByUserId ? (
                  <Link className="details-submitter-pill" to={`/users/${encodeURIComponent(resource.submittedByUsername ?? resource.submittedByUserId)}`} aria-describedby={profilePreviewId} onFocus={() => setSubmitterFocused(true)} onBlur={() => setSubmitterFocused(false)}>
                    <SubmitterHoverCard userId={resource.submittedByUserId} name={resource.submittedBy} image={resource.submittedByImage} previewId={profilePreviewId} className="details-submitter-hovercard" focused={submitterFocused}>
                      <span className="details-submitter-avatar" aria-hidden="true">
                        {resource.submittedByImage ? <img src={resource.submittedByImage} alt="" /> : resource.submittedBy.slice(0, 1).toUpperCase()}
                      </span>
                      <span>{resource.submittedBy}</span>
                    </SubmitterHoverCard>
                  </Link>
                ) : resource.submittedBy}
              </dd></div>
              {resource.fromMod && <div><dt>From Mod</dt><dd>{resource.fromMod}</dd></div>}
              <div><dt>Original By</dt><dd>{resource.originalBy || "Not listed"}</dd></div>
              {resource.recreationBy?.trim() && resource.recreationBy.trim().toLowerCase() !== "not listed" && <div><dt>Recreation By</dt><dd>{resource.recreationBy}</dd></div>}
              <div><dt>Created At</dt><dd><time dateTime={resource.createdAt}>{formatDate(resource.createdAt)}</time></dd></div>
              <div><dt>Updated At</dt><dd><time dateTime={resource.updatedAt}>{formatDate(resource.updatedAt)}</time></dd></div>
            </dl>
            {resource.tags.length > 0 && <div className="details-tags" aria-label="Tags">{resource.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div>}
            <div className="details-actions">
              {resource.downloadUrl ? <Button render={<a href={resource.downloadUrl} download={!resource.downloadUrl.startsWith("http")} target={resource.downloadUrl.startsWith("http") ? "_blank" : undefined} rel={resource.downloadUrl.startsWith("http") ? "noreferrer" : undefined} />}><Download size={15} />Download resource</Button> : resource.alternateDownloads.length === 0 && <p>Download not provided.</p>}
              {resource.alternateDownloads.map((url, index) => <Button key={url} variant="outline" render={<a href={url} target="_blank" rel="noreferrer" />}><Download size={15} />Alternative download {index + 1}</Button>)}
              {authData?.user ? <Button variant="ghost" size="sm" onClick={() => setReportOpen(true)}><Flag size={15} />Report an issue</Button> : !authPending && <Button variant="ghost" size="sm" render={<Link to="/login" />}><Flag size={15} />Log in to report</Button>}
            </div>
          </div>
          <ResourceReportDialog resource={resource} open={reportOpen} onOpenChange={setReportOpen} />
        </article>
      ) : (
        <section className="details-message" role="status"><h1>Resource not found</h1><p>This resource isn’t in the catalog.</p></section>
      )}
    </div>
  )
}
