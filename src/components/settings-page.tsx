import { useEffect, useState, type FormEvent } from "react"
import { Navigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fetchAccountProfile, saveAccountUsername } from "@/data/account-api"
import { authClient } from "@/lib/auth-client"
import { readAdminNavigationPreference, writeAdminNavigationPreference } from "@/lib/admin-navigation-preference"

type ColorScheme = "light" | "dark"

function formatAvailableAt(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

export function SettingsPage({ scheme, onToggleScheme }: { scheme: ColorScheme; onToggleScheme: () => void }) {
  const { data, isPending } = authClient.useSession()
  const [username, setUsername] = useState("")
  const [draft, setDraft] = useState("")
  const [availableAt, setAvailableAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState<string>()
  const [isAdmin, setIsAdmin] = useState(false)
  const [hideAdminPages, setHideAdminPages] = useState(false)

  useEffect(() => {
    setIsAdmin(false)
    setHideAdminPages(false)
    const userId = data?.user?.id
    if (!userId) return
    const controller = new AbortController()
    fetch("/api/admin/check", { credentials: "same-origin", signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ isAdmin?: boolean }> : null)
      .then((result) => {
        if (controller.signal.aborted) return
        const admin = result?.isAdmin === true
        setIsAdmin(admin)
        setHideAdminPages(admin ? readAdminNavigationPreference(userId) : false)
      })
      .catch(() => { if (!controller.signal.aborted) setIsAdmin(false) })
    return () => controller.abort()
  }, [data?.user?.id])

  useEffect(() => {
    if (!data?.user) return
    const controller = new AbortController()
    fetchAccountProfile(controller.signal)
      .then((profile) => {
        setUsername(profile.username)
        setDraft(profile.username)
        setAvailableAt(profile.usernameChangeAvailableAt)
        setError(undefined)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return
        setError(cause instanceof Error ? cause.message : "Your settings could not be loaded.")
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [data?.user])

  if (isPending) return <section className="settings-page" aria-busy="true"><p role="status">Loading settings…</p></section>
  if (!data?.user) return <Navigate to="/login" replace />

  const cooldownActive = Boolean(availableAt && Date.now() < Date.parse(availableAt))
  const unchanged = draft.trim().toLowerCase() === username.toLowerCase()

  async function handleUsernameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setSuccess(undefined)
    setSaving(true)
    try {
      const result = await saveAccountUsername(draft.trim())
      setUsername(result.username)
      setDraft(result.username)
      setAvailableAt(result.usernameChangeAvailableAt)
      setSuccess("Username updated.")
      window.dispatchEvent(new CustomEvent("funkin-archive:profile-updated", { detail: { username: result.username } }))
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Your username could not be changed.")
      if (cause instanceof Error && cause.message.includes("change your username again on")) {
        const match = cause.message.match(/on (.+)\.$/)
        if (match) {
          const parsed = Date.parse(match[1])
          if (!Number.isNaN(parsed)) setAvailableAt(new Date(parsed).toISOString())
        }
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-page">
      <header className="settings-header"><h1>Settings</h1></header>

      <section className="settings-panel" aria-labelledby="settings-appearance-heading">
        <div className="settings-panel-copy"><h2 id="settings-appearance-heading">Appearance</h2></div>
        <div className="settings-theme-row">
          <span className="settings-theme-label" id="settings-dark-mode-label">Dark mode</span>
          <label className="theme-switch">
            <input className="theme-switch-input" type="checkbox" role="switch" checked={scheme === "dark"} aria-labelledby="settings-dark-mode-label" onChange={onToggleScheme} />
            <span className="theme-switch-track" aria-hidden="true"><span className="theme-switch-thumb" /></span>
          </label>
        </div>
      </section>

      {isAdmin && <section className="settings-panel" aria-labelledby="settings-navigation-heading">
        <div className="settings-panel-copy"><h2 id="settings-navigation-heading">Navigation</h2></div>
        <div className="settings-theme-row">
          <span className="settings-theme-label" id="settings-hide-admin-pages-label">Hide Admin from navigation</span>
          <label className="theme-switch">
            <input className="theme-switch-input" type="checkbox" role="switch" checked={hideAdminPages} aria-labelledby="settings-hide-admin-pages-label" onChange={(event) => {
              const hidden = event.currentTarget.checked
              setHideAdminPages(hidden)
              if (data?.user?.id) writeAdminNavigationPreference(data.user.id, hidden)
            }} />
            <span className="theme-switch-track" aria-hidden="true"><span className="theme-switch-thumb" /></span>
          </label>
        </div>
      </section>}

      <section className="settings-panel" aria-labelledby="settings-username-heading">
        <div className="settings-panel-copy"><h2 id="settings-username-heading">Profile info</h2></div>
        <form className="settings-username-form" aria-labelledby="settings-username-heading" onSubmit={(event) => { void handleUsernameSubmit(event) }}>
          <label htmlFor="settings-username">Profile username</label>
          <div className="settings-username-controls">
            <div className="settings-username-input"><span aria-hidden="true">@</span><Input id="settings-username" name="username" value={draft} onChange={(event) => { setDraft(event.target.value); setError(undefined); setSuccess(undefined) }} autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={24} pattern="[A-Za-z0-9](?:[A-Za-z0-9-]{1,22}[A-Za-z0-9])?" aria-describedby="settings-username-help settings-username-cooldown" required disabled={loading || saving || cooldownActive} /></div>
            <Button type="submit" disabled={loading || saving || cooldownActive || unchanged}>{saving ? "Saving…" : "Save username"}</Button>
          </div>
          <p className="settings-field-help" id="settings-username-help">3–24 letters, numbers, or hyphens. Usernames are case-insensitive.</p>
          <p className="settings-field-help" id="settings-username-cooldown">Usernames can be changed once every 7 days{cooldownActive && availableAt ? `. Next change: ${formatAvailableAt(availableAt)}.` : "."}</p>
          {error && <p className="settings-message is-error" role="alert">{error}</p>}
          {success && <p className="settings-message is-success" role="status">{success}</p>}
        </form>
      </section>
    </div>
  )
}
