import { useEffect, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { ArrowDown, ArrowUp, Check, Clock3, ExternalLink, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ResourceTypeIcon } from "@/components/resource-type-icon"
import type { ResourceListing } from "@/data/resources"

type ReviewStatus = "pending" | "accepted" | "rejected"
type ModerationSettings = { autoApproval: boolean; submissionsLocked: boolean }
type AdminResourcesResult = {
  resources: ResourceListing[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  counts: Record<ReviewStatus, number>
}

const reviewTabs: { value: ReviewStatus; label: string }[] = [
  { value: "pending", label: "Needs review" },
  { value: "accepted", label: "Approved" },
  { value: "rejected", label: "Rejected" },
]

async function readError(response: Response) {
  const result = await response.json().catch(() => null) as { message?: string } | null
  return result?.message ?? `Request failed (${response.status})`
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)
}

function statusLabel(resource: ResourceListing) {
  const status = resource.status.trim().toLocaleLowerCase()
  return status === "pending" ? "Needs review" : status === "rejected" ? "Rejected" : "Approved"
}

export function AdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [status, setStatus] = useState<ReviewStatus>("pending")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<AdminResourcesResult | null>(null)
  const [settings, setSettings] = useState<ModerationSettings | null>(null)
  const [draftSettings, setDraftSettings] = useState<ModerationSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [savingResourceId, setSavingResourceId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [settingsError, setSettingsError] = useState("")
  const [reload, setReload] = useState(0)

  useEffect(() => {
    document.title = "Admin - FunkinArchive"
    return () => { document.title = "Browse - FunkinArchive" }
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const check = await fetch("/api/admin/check", { credentials: "same-origin" })
        if (!check.ok) throw new Error(await readError(check))
        const access = await check.json() as { isAdmin?: boolean }
        if (!active) return
        setAuthorized(access.isAdmin === true)
        if (!access.isAdmin) { setLoading(false); return }

        const [resourcesResponse, settingsResponse] = await Promise.all([
          fetch(`/api/admin/resources?status=${status}&page=${page}`, { credentials: "same-origin" }),
          fetch("/api/admin/settings", { credentials: "same-origin" }),
        ])
        if (!resourcesResponse.ok) throw new Error(await readError(resourcesResponse))
        if (!settingsResponse.ok) throw new Error(await readError(settingsResponse))
        const [resourcesResult, settingsResult] = await Promise.all([
          resourcesResponse.json() as Promise<AdminResourcesResult>,
          settingsResponse.json() as Promise<{ settings: ModerationSettings }>,
        ])
        if (!active) return
        setData(resourcesResult)
        setSettings(settingsResult.settings)
        setDraftSettings(settingsResult.settings)
      } catch (cause) {
        if (!active) return
        setError(cause instanceof Error ? cause.message : "The admin page could not be loaded.")
      } finally {
        if (active) {
          setLoading(false)
          setSettingsLoading(false)
        }
      }
    })()
    return () => { active = false }
  }, [status, page, reload])

  async function changeStatus(resource: ResourceListing, nextStatus: ReviewStatus) {
    setSavingResourceId(resource.id)
    setError("")
    try {
      const response = await fetch(`/api/admin/resources/${encodeURIComponent(resource.id)}/status`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!response.ok) throw new Error(await readError(response))
      setLoading(true)
      setReload((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The approval status could not be changed.")
    } finally {
      setSavingResourceId(null)
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draftSettings) return
    setSavingSettings(true)
    setSettingsError("")
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftSettings),
      })
      if (!response.ok) throw new Error(await readError(response))
      const result = await response.json() as { settings: ModerationSettings }
      setSettings(result.settings)
      setDraftSettings(result.settings)
    } catch (cause) {
      setSettingsError(cause instanceof Error ? cause.message : "Settings could not be saved.")
    } finally {
      setSavingSettings(false)
    }
  }

  if (authorized === false && !loading && !error) {
    return <section className="admin-page"><div className="admin-access-message"><ShieldCheck size={22} aria-hidden="true" /><h1>Admin access required</h1><p>This page is available to site administrators.</p><Button variant="outline" render={<Link to="/" />}>Back to Browse</Button></div></section>
  }

  const settingsChanged = Boolean(settings && draftSettings && (settings.autoApproval !== draftSettings.autoApproval || settings.submissionsLocked !== draftSettings.submissionsLocked))

  return (
    <section className="admin-page">
      <header className="admin-header">
        <Button variant="outline" onClick={() => { setError(""); setLoading(true); setReload((value) => value + 1) }} disabled={loading}>
          <RefreshCw size={15} aria-hidden="true" />Refresh
        </Button>
      </header>

      {error && <div className="admin-error" role="alert"><span>{error}</span><Button variant="outline" size="sm" onClick={() => { setError(""); setLoading(true); setReload((value) => value + 1) }}>Retry</Button></div>}

      <div className="admin-layout">
        <section className="admin-review-section" aria-label="Resource submissions">
          <div className="admin-review-tabs" role="group" aria-label="Filter submissions by approval status">
            {reviewTabs.map((tab) => <button key={tab.value} type="button" aria-pressed={status === tab.value} onClick={() => { setError(""); setLoading(true); setStatus(tab.value); setPage(1) }}>
              {tab.label}<span>{data?.counts[tab.value] ?? "—"}</span>
            </button>)}
          </div>

          {loading ? <div className="admin-loading" role="status"><LoaderCircle size={17} className="admin-spin" aria-hidden="true" />Loading submissions…</div>
            : data?.resources.length ? <>
              <div className="admin-table-scroll" role="region" aria-label="Submitted resources" tabIndex={0}>
                <table className="admin-table">
                  <caption className="sr-only">Resources submitted for FunkinArchive</caption>
                  <thead><tr><th scope="col">Resource</th><th scope="col">Submitted by</th><th scope="col">Type</th><th scope="col">Submitted</th><th scope="col">Approval</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>{data.resources.map((resource) => {
                    const busy = savingResourceId === resource.id
                    return <tr key={resource.id}>
                      <td data-label="Resource">
                        <div className="admin-resource-cell">
                          <Link to={`/resources/${encodeURIComponent(resource.slug)}`} className="admin-resource-cover" aria-label={`Open ${resource.title}`}>
                            {resource.coverUrl ? <img src={resource.coverUrl} alt="" loading="lazy" /> : <span aria-hidden="true"><ShieldCheck size={18} /></span>}
                          </Link>
                          <div className="admin-resource-copy">
                            <Link to={`/resources/${encodeURIComponent(resource.slug)}`} className="admin-resource-title">{resource.title}</Link>
                            {resource.description && <p>{resource.description}</p>}
                            {resource.originalBy && <span>Original by {resource.originalBy}</span>}
                          </div>
                        </div>
                      </td>
                      <td data-label="Submitted by">{resource.submittedByUserId ? <Link className="admin-submitter" to={`/users/${encodeURIComponent(resource.submittedByUsername ?? resource.submittedByUserId)}`}>
                        <span className="admin-submitter-avatar">{resource.submittedByImage ? <img src={resource.submittedByImage} alt="" /> : resource.submittedBy.slice(0, 1).toUpperCase()}</span>{resource.submittedBy}
                      </Link> : <span className="admin-submitter"><span className="admin-submitter-avatar">{resource.submittedBy.slice(0, 1).toUpperCase()}</span>{resource.submittedBy}</span>}</td>
                      <td data-label="Type"><span className="admin-type"><ResourceTypeIcon type={resource.fileType || resource.category || "Other"} />{resource.fileType || resource.category || "Other"}</span></td>
                      <td data-label="Submitted">{formatDate(resource.createdAt)}</td>
                      <td data-label="Approval"><span className={`admin-status admin-status-${resource.status.trim().toLocaleLowerCase() || "accepted"}`}>{statusLabel(resource)}</span></td>
                      <td data-label="Actions"><div className="admin-actions">
                        {status === "pending" ? <>
                          <Button size="sm" onClick={() => { void changeStatus(resource, "accepted") }} disabled={busy}><Check size={14} aria-hidden="true" />Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => { void changeStatus(resource, "rejected") }} disabled={busy}><X size={14} aria-hidden="true" />Reject</Button>
                        </> : <Button size="sm" variant="outline" onClick={() => { void changeStatus(resource, "pending") }} disabled={busy}><Clock3 size={14} aria-hidden="true" />Return to review</Button>}
                        <Link className="admin-open-link" to={`/resources/${encodeURIComponent(resource.slug)}`} aria-label={`Open ${resource.title} details`}><ExternalLink size={15} aria-hidden="true" /></Link>
                      </div></td>
                    </tr>
                  })}</tbody>
                </table>
              </div>
              {data.pageCount > 1 && <nav className="admin-pagination" aria-label="Submission pages">
                <span>Page {data.page} of {data.pageCount}</span>
                <div><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => { setError(""); setLoading(true); setPage((current) => Math.max(1, current - 1)) }}><ArrowUp size={14} aria-hidden="true" />Newer</Button><Button variant="outline" size="sm" disabled={page >= data.pageCount || loading} onClick={() => { setError(""); setLoading(true); setPage((current) => Math.min(data.pageCount, current + 1)) }}>Older<ArrowDown size={14} aria-hidden="true" /></Button></div>
              </nav>}
            </> : <div className="admin-empty"><span><Check size={18} aria-hidden="true" /></span><h3>{status === "pending" ? "Nothing to review" : `No ${status === "accepted" ? "approved" : "rejected"} resources`}</h3></div>}
        </section>

        <aside className="admin-settings-panel" aria-label="Submission settings">
          {settingsLoading || !draftSettings ? <p className="admin-settings-loading" role="status">Loading settings…</p> : <form onSubmit={(event) => { void saveSettings(event) }}>
            <label className="admin-setting-row">
              <span className="admin-setting-icon"><Check size={16} aria-hidden="true" /></span>
              <span className="admin-setting-copy"><strong>Auto-approve submissions</strong></span>
              <Checkbox checked={draftSettings.autoApproval} onCheckedChange={(checked) => setDraftSettings((current) => current ? { ...current, autoApproval: checked === true } : current)} aria-label="Auto-approve submissions" />
            </label>
            <label className="admin-setting-row">
              <span className="admin-setting-icon"><LockKeyhole size={16} aria-hidden="true" /></span>
              <span className="admin-setting-copy"><strong>Lock new submissions</strong></span>
              <Checkbox checked={draftSettings.submissionsLocked} onCheckedChange={(checked) => setDraftSettings((current) => current ? { ...current, submissionsLocked: checked === true } : current)} aria-label="Lock new submissions" />
            </label>
            {settingsError && <p className="admin-settings-error" role="alert">{settingsError}</p>}
            <Button className="admin-save-settings" type="submit" disabled={!settingsChanged || savingSettings}>{savingSettings ? "Saving…" : "Save settings"}</Button>
          </form>}
        </aside>
      </div>
    </section>
  )
}
