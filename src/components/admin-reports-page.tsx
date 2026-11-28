import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowDown, ArrowUp, Check, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AdminNavigation } from "@/components/admin-navigation"

type ReportStatus = "open" | "in_review" | "resolved" | "dismissed"
type Report = { id: string; resourceId: string; resourceSlug: string; resourceTitle: string; reporter: string; reasonCode: string; targetField: string; targetIndex: number | null; details: string; suggestedUrl: string | null; suggestedImageUrl: string | null; currentValue: string | null; createdAt: string }
type Result = { reports: Report[]; total: number; page: number; pageSize: number; pageCount: number; counts: Record<ReportStatus, number> }
const tabs: { value: ReportStatus; label: string }[] = [{ value: "open", label: "Open" }, { value: "in_review", label: "In progress" }, { value: "resolved", label: "Resolved" }, { value: "dismissed", label: "Dismissed" }]
const reasonLabels: Record<string, string> = { leaked_private_content: "Leaked or private content", paid_download: "Paid download", unrelated_resource: "Not FNF related", credit_problem: "Credit problem", spam_duplicate_misleading: "Spam, duplicate, or misleading", community_safety: "Community safety", unsafe_download: "Unsafe download", broken_cover: "Broken cover image", broken_download: "Broken download link", incorrect_details: "Incorrect details", other: "Other" }
async function responseError(response: Response) { const body = await response.json().catch(() => null) as { message?: string } | null; return body?.message ?? `Request failed (${response.status})` }
function reportDate(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date) }

export function AdminReportsPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [status, setStatus] = useState<ReportStatus>("open")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState("")
  const [replacement, setReplacement] = useState<Record<string, string>>({})
  const [note, setNote] = useState<Record<string, string>>({})
  const [reload, setReload] = useState(0)

  useEffect(() => { document.title = "Reports - Admin - FunkinArchive"; return () => { document.title = "Browse - FunkinArchive" } }, [])
  useEffect(() => {
    let active = true
    void (async () => {
      setLoading(true); setError("")
      try {
        const check = await fetch("/api/admin/check", { credentials: "same-origin" })
        if (!check.ok) throw new Error(await responseError(check))
        const access = await check.json() as { isAdmin?: boolean }
        if (!active) return
        setAuthorized(access.isAdmin === true)
        if (!access.isAdmin) return
        const response = await fetch(`/api/admin/reports?${new URLSearchParams({ status, page: String(page) })}`, { credentials: "same-origin" })
        if (!response.ok) throw new Error(await responseError(response))
        const result = await response.json() as Result
        if (active) setData(result)
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Reports could not be loaded.") }
      finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [status, page, reload])

  async function act(report: Report, action: string) {
    setBusyId(report.id); setError("")
    try {
      const response = await fetch(`/api/admin/reports/${encodeURIComponent(report.id)}`, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, value: replacement[report.id] ?? "", note: note[report.id] ?? "" }) })
      if (!response.ok) throw new Error(await responseError(response))
      setReload((value) => value + 1)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The report action could not be saved.") }
    finally { setBusyId("") }
  }

  if (authorized === false && !loading) return <section className="admin-page"><div className="admin-access-message"><ShieldCheck size={22} aria-hidden="true" /><h1>Admin access required</h1><p>This page is available to site administrators.</p><Button variant="outline" render={<Link to="/" />}>Back to Browse</Button></div></section>

  return <section className="admin-page admin-reports-page">
    <AdminNavigation />
    <header className="admin-header admin-reports-header"><div><h1>Reports</h1><p>Review reported resources and suggested fixes.</p></div><div><Button variant="outline" onClick={() => setReload((value) => value + 1)} disabled={loading}><RefreshCw size={15} aria-hidden="true" />Refresh</Button></div></header>
    <div className="admin-report-tabs" role="group" aria-label="Filter reports by status">{tabs.map((tab) => <button key={tab.value} type="button" aria-pressed={status === tab.value} onClick={() => { setStatus(tab.value); setPage(1) }}>{tab.label}<span>{data?.counts[tab.value] ?? "—"}</span></button>)}</div>
    {error && <div className="admin-error" role="alert">{error}<Button variant="outline" size="sm" onClick={() => setReload((value) => value + 1)}>Retry</Button></div>}
    {loading ? <div className="admin-loading" role="status"><LoaderCircle size={17} className="admin-spin" aria-hidden="true" />Loading reports…</div> : data?.reports.length ? <div className="admin-report-list">{data.reports.map((report) => {
      const busy = busyId === report.id
      const applicable = report.targetField === "cover" || report.targetField === "download" || report.targetField === "alternate_download"
      const hasFix = Boolean(report.suggestedImageUrl || report.suggestedUrl || replacement[report.id]?.trim())
      return <article className="admin-report-card" key={report.id}>
        <header><div><span className="admin-report-reason">{reasonLabels[report.reasonCode] ?? report.reasonCode}</span><span className="admin-report-date">{reportDate(report.createdAt)} · {report.reporter}</span></div><Link className="admin-open-link" to={`/resources/${encodeURIComponent(report.resourceSlug)}`} aria-label={`Open ${report.resourceTitle}`}><ExternalLink size={16} /></Link></header>
        <h2><Link to={`/resources/${encodeURIComponent(report.resourceSlug)}`}>{report.resourceTitle}</Link></h2>
        <p className="admin-report-details">{report.details}</p>
        {(report.currentValue || report.suggestedUrl || report.suggestedImageUrl) && <div className="admin-report-evidence">
          {report.currentValue && <div><strong>Current</strong><span>{report.currentValue.startsWith("http") ? <a href={report.currentValue} target="_blank" rel="noreferrer">{report.currentValue}</a> : report.targetField === "metadata" ? report.currentValue : report.currentValue}</span></div>}
          {report.suggestedUrl && <div><strong>Suggested</strong><a href={report.suggestedUrl} target="_blank" rel="noreferrer">{report.suggestedUrl}</a></div>}
          {report.suggestedImageUrl && <div><strong>Suggested image</strong><a href={report.suggestedImageUrl} target="_blank" rel="noreferrer"><img src={report.suggestedImageUrl} alt="User suggested replacement" loading="lazy" /></a></div>}
        </div>}
        {applicable && <label className="admin-report-replacement"><span>{report.targetField === "cover" ? "Replacement image URL" : "Replacement download URL"}</span><input type="url" placeholder={report.suggestedUrl ?? "https://…"} value={replacement[report.id] ?? ""} onChange={(event) => setReplacement((current) => ({ ...current, [report.id]: event.target.value }))} /></label>}
        <label className="admin-report-note"><span>Admin note <small>Optional</small></span><input value={note[report.id] ?? ""} maxLength={1000} onChange={(event) => setNote((current) => ({ ...current, [report.id]: event.target.value }))} placeholder="Add context for the audit log" /></label>
        <footer><Button size="sm" variant="outline" onClick={() => { void act(report, "investigate") }} disabled={busy}><ShieldCheck size={14} />Investigate</Button>{applicable && <Button size="sm" onClick={() => { void act(report, "apply_fix") }} disabled={busy || !hasFix}><Check size={14} />Apply fix</Button>}<Button size="sm" variant="outline" onClick={() => { void act(report, "resolve") }} disabled={busy}>Resolve</Button><Button size="sm" variant="ghost" onClick={() => { void act(report, "dismiss") }} disabled={busy}><X size={14} />Dismiss</Button>{["leaked_private_content", "paid_download", "unsafe_download", "community_safety"].includes(report.reasonCode) && <Button size="sm" variant="destructive" onClick={() => { void act(report, "reject_resource") }} disabled={busy}>Reject resource</Button>}</footer>
      </article>
    })}</div> : <div className="admin-empty"><span><Check size={18} aria-hidden="true" /></span><h3>No {status.replace("_", " ")} reports</h3></div>}
    {!loading && data && data.pageCount > 1 && <nav className="admin-pagination" aria-label="Report pages"><span>Page {data.page} of {data.pageCount}</span><div><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ArrowUp size={14} />Newer</Button><Button variant="outline" size="sm" disabled={page >= data.pageCount} onClick={() => setPage((value) => value + 1)}>Older<ArrowDown size={14} /></Button></div></nav>}
  </section>
}
