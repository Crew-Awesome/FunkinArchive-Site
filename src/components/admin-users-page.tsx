import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowDown, ArrowUp, Ban, Check, CircleUserRound, LoaderCircle, RefreshCw, Search, ShieldCheck, UserRoundX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AdminNavigation } from "@/components/admin-navigation"

type Restriction = { id: string; action: string; reason: string; expires_at: string | null; created_at: string }
type UserAction = { id: string; action: string; note: string; created_at: string; admin_username: string | null }
type UserResource = { id: string; slug: string; title: string; status: string; created_at: string }
type AdminUser = { id: string; name: string; username: string | null; email: string; image: string | null; bio: string; banner: string | null; createdAt: string; isAdmin: boolean; resourceCount: number; approvedCount: number; restrictions: Restriction[]; actions: UserAction[]; resources: UserResource[] }
type UsersResult = { users: AdminUser[]; total: number; page: number; pageSize: number; pageCount: number }
type Sanction = "ban" | "mute" | "restrict_submissions"
const sanctionLabels: Record<Sanction, string> = { ban: "Ban account", mute: "Mute account", restrict_submissions: "Stop submissions" }
const actionLabels: Record<string, string> = { ban: "Banned account", mute: "Muted account", restrict_submissions: "Restricted submissions", lift_restriction: "Lifted a restriction", reset_profile: "Reset profile appearance", resource_status: "Changed a submission" }
async function readError(response: Response) { const result = await response.json().catch(() => null) as { message?: string } | null; return result?.message ?? `Request failed (${response.status})` }
function displayDate(value: string | null) { if (!value) return "No end date"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date) }

export function AdminUsersPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<UsersResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState("")
  const [sanctionByUser, setSanctionByUser] = useState<Record<string, Sanction>>({})
  const [durationByUser, setDurationByUser] = useState<Record<string, string>>({})
  const [noteByUser, setNoteByUser] = useState<Record<string, string>>({})
  const [reload, setReload] = useState(0)

  useEffect(() => { document.title = "Users - Admin - FunkinArchive"; return () => { document.title = "Browse - FunkinArchive" } }, [])
  useEffect(() => { const timeout = window.setTimeout(() => setSearch(query.trim()), 220); return () => window.clearTimeout(timeout) }, [query])
  useEffect(() => {
    let active = true
    void (async () => {
      setLoading(true); setError("")
      try {
        const check = await fetch("/api/admin/check", { credentials: "same-origin" })
        if (!check.ok) throw new Error(await readError(check))
        const access = await check.json() as { isAdmin?: boolean }
        if (!active) return
        setAuthorized(access.isAdmin === true)
        if (!access.isAdmin) return
        const params = new URLSearchParams({ page: String(page) })
        if (search) params.set("q", search)
        const response = await fetch(`/api/admin/users?${params}`, { credentials: "same-origin" })
        if (!response.ok) throw new Error(await readError(response))
        const result = await response.json() as UsersResult
        if (active) setData(result)
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Users could not be loaded.") }
      finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [search, page, reload])

  async function act(user: AdminUser, action: string, extra: Record<string, string> = {}) {
    setBusyId(user.id); setError("")
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note: noteByUser[user.id] ?? "", ...extra }) })
      if (!response.ok) throw new Error(await readError(response))
      setReload((value) => value + 1)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The user action could not be saved.") }
    finally { setBusyId("") }
  }

  async function changeResource(user: AdminUser, resource: UserResource, status: "accepted" | "rejected") {
    setBusyId(user.id); setError("")
    try {
      const response = await fetch(`/api/admin/resources/${encodeURIComponent(resource.id)}/status`, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
      if (!response.ok) throw new Error(await readError(response))
      setReload((value) => value + 1)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The submission status could not be changed.") }
    finally { setBusyId("") }
  }

  if (authorized === false && !loading) return <section className="admin-page"><AdminNavigation /><div className="admin-access-message"><ShieldCheck size={22} aria-hidden="true" /><h1>Admin access required</h1><p>This page is available to site administrators.</p><Button variant="outline" render={<Link to="/" />}>Back to Browse</Button></div></section>

  return <section className="admin-page admin-users-page">
    <AdminNavigation />
    <div className="admin-user-tools">
      <label className="admin-users-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search users by username, name, email, or account ID</span><Input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search users" autoComplete="off" /></label>
      <Button variant="outline" onClick={() => setReload((value) => value + 1)} disabled={loading}><RefreshCw size={15} aria-hidden="true" />Refresh</Button>
    </div>
    {error && <div className="admin-error" role="alert">{error}<Button variant="outline" size="sm" onClick={() => setReload((value) => value + 1)}>Retry</Button></div>}
    {loading ? <div className="admin-loading" role="status"><LoaderCircle size={17} className="admin-spin" />Loading users…</div> : data?.users.length ? <div className="admin-user-list">{data.users.map((user) => {
      const busy = busyId === user.id
      const sanction = sanctionByUser[user.id] ?? "restrict_submissions"
      return <article className="admin-user-card" key={user.id}>
        <header className="admin-user-card-header">
          <span className="admin-user-avatar" aria-hidden="true">{user.image ? <img src={user.image} alt="" /> : <CircleUserRound size={23} />}</span>
          <div className="admin-user-identity"><h2>{user.name}{user.username && <span>@{user.username}</span>}</h2><p>{user.email}</p><div className="admin-user-meta"><span>Joined {displayDate(user.createdAt)}</span><span><strong>{user.approvedCount}</strong> approved</span><span><strong>{user.resourceCount}</strong> submissions</span></div></div>
          {user.isAdmin ? <span className="admin-user-badge"><ShieldCheck size={14} />Admin</span> : user.username && <Button variant="ghost" size="sm" render={<Link to={`/users/${encodeURIComponent(user.username)}`} />}>View profile</Button>}
        </header>
        {user.isAdmin ? <p className="admin-user-admin-note">Site admins are exempt from user restrictions.</p> : <>
          {user.restrictions.length > 0 && <section className="admin-user-restrictions" aria-label="Active restrictions"><h3>Active restrictions</h3>{user.restrictions.map((restriction) => <div className="admin-user-restriction" key={restriction.id}><div><strong>{sanctionLabels[restriction.action as Sanction] ?? restriction.action}</strong><span>{restriction.reason} · {restriction.expires_at ? `until ${displayDate(restriction.expires_at)}` : "permanent"}</span></div><Button size="sm" variant="outline" disabled={busy} onClick={() => { void act(user, "lift", { sanction: restriction.action }) }}>Lift</Button></div>)}</section>}
          <section className="admin-user-controls" aria-label={`Manage ${user.name}`}>
            <div className="admin-user-control-row">
              <label htmlFor={`sanction-${user.id}`}><span>Action</span><select id={`sanction-${user.id}`} value={sanction} onChange={(event) => setSanctionByUser((current) => ({ ...current, [user.id]: event.target.value as Sanction }))}>{Object.entries(sanctionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label htmlFor={`duration-${user.id}`}><span>Length</span><select id={`duration-${user.id}`} value={durationByUser[user.id] ?? "7"} onChange={(event) => setDurationByUser((current) => ({ ...current, [user.id]: event.target.value }))}><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="permanent">Permanent</option></select></label>
            </div>
            <label className="admin-user-reason" htmlFor={`reason-${user.id}`}><span>Reason</span><input id={`reason-${user.id}`} value={noteByUser[user.id] ?? ""} maxLength={1000} onChange={(event) => setNoteByUser((current) => ({ ...current, [user.id]: event.target.value }))} placeholder="Why are you applying this restriction?" /></label>
            <div className="admin-user-buttons"><Button size="sm" variant="destructive" disabled={busy || (noteByUser[user.id] ?? "").trim().length < 5} onClick={() => { void act(user, sanction, { duration: durationByUser[user.id] ?? "7" }) }}><Ban size={14} />Apply restriction</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm(`Remove ${user.name}'s profile photo, banner, and bio?`)) void act(user, "reset_profile") }}><UserRoundX size={14} />Reset profile</Button></div>
          </section>
          {user.resources.length > 0 && <section className="admin-user-submissions"><div className="admin-user-submissions-heading"><h3>Recent submissions</h3><Link to={`/admin?q=${encodeURIComponent(user.username ?? user.name)}`}>Review all {user.resourceCount}</Link></div>{user.resources.map((resource) => { const rejected = resource.status.toLowerCase() === "rejected"; return <div className="admin-user-submission" key={resource.id}><Link to={`/resources/${encodeURIComponent(resource.slug)}`}>{resource.title}</Link><span className={`admin-status admin-status-${rejected ? "rejected" : resource.status.toLowerCase() || "accepted"}`}>{rejected ? "Removed" : resource.status.trim() || "Approved"}</span><Button size="sm" variant="outline" disabled={busy} onClick={() => { if (rejected || window.confirm(`Remove “${resource.title}” from public pages? Admins can restore it.`)) void changeResource(user, resource, rejected ? "accepted" : "rejected") }}>{rejected ? "Restore" : "Remove"}</Button></div> })}</section>}
          {user.actions.length > 0 && <details className="admin-user-history"><summary>Recent admin actions</summary><ul>{user.actions.map((entry) => <li key={entry.id}><span>{actionLabels[entry.action] ?? entry.action}{entry.note ? ` · ${entry.note}` : ""}</span><small>{displayDate(entry.created_at)}{entry.admin_username ? ` · @${entry.admin_username}` : ""}</small></li>)}</ul></details>}
        </>}
      </article>
    })}</div> : <div className="admin-empty"><span><Check size={18} aria-hidden="true" /></span><h3>{search ? "No users match this search" : "No user accounts yet"}</h3></div>}
    {!loading && data && data.pageCount > 1 && <nav className="admin-pagination" aria-label="User pages"><span>{data.total} accounts · Page {data.page} of {data.pageCount}</span><div><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ArrowUp size={14} />Newer</Button><Button variant="outline" size="sm" disabled={page >= data.pageCount} onClick={() => setPage((value) => value + 1)}>Older<ArrowDown size={14} /></Button></div></nav>}
  </section>
}
