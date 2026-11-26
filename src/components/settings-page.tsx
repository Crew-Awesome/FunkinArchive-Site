import { useEffect, useState, type FormEvent } from "react"
import { Navigate } from "react-router-dom"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fetchAccountProfile, saveAccountUsername } from "@/data/account-api"
import { authClient } from "@/lib/auth-client"

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
      <header className="settings-header"><p className="eyebrow">ACCOUNT</p><h1>Settings</h1><p>Manage how your profile appears and how FunkinArchive looks.</p></header>

      <section className="settings-panel" aria-labelledby="settings-appearance-heading">
        <div className="settings-panel-copy"><h2 id="settings-appearance-heading">Appearance</h2><p>Choose the color theme for this device.</p></div>
        <div className="settings-theme-row">
          <span className="settings-theme-label">{scheme === "dark" ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}{scheme === "dark" ? "Dark mode" : "Light mode"}</span>
          <Button type="button" variant="outline" aria-pressed={scheme === "dark"} onClick={onToggleScheme}>Switch to {scheme === "dark" ? "light" : "dark"} mode</Button>
        </div>
      </section>

      <section className="settings-panel" aria-labelledby="settings-username-heading">
        <div className="settings-panel-copy"><h2 id="settings-username-heading">Username</h2><p>Your profile is at <strong>/users/{username || "…"}</strong>. You can change your username once every 7 days.</p></div>
        <form className="settings-username-form" onSubmit={(event) => { void handleUsernameSubmit(event) }}>
          <label htmlFor="settings-username">Profile username</label>
          <div className="settings-username-controls"><span aria-hidden="true">@</span><Input id="settings-username" value={draft} onChange={(event) => { setDraft(event.target.value); setError(undefined); setSuccess(undefined) }} autoComplete="username" minLength={3} maxLength={24} pattern="[A-Za-z0-9](?:[A-Za-z0-9-]{1,22}[A-Za-z0-9])?" required disabled={loading || saving || cooldownActive} /></div>
          <p className="settings-field-help">3–24 letters, numbers, or hyphens. Usernames are case-insensitive.</p>
          {cooldownActive && <p className="settings-field-help">You can change it again on {formatAvailableAt(availableAt!)}.</p>}
          {error && <p className="settings-message is-error" role="alert">{error}</p>}
          {success && <p className="settings-message is-success" role="status">{success}</p>}
          <Button type="submit" disabled={loading || saving || cooldownActive || unchanged}>{saving ? "Saving…" : "Save username"}</Button>
        </form>
      </section>
    </div>
  )
}
