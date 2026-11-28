import { lazy, Suspense, useEffect, useState } from "react"
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom"
import {
  AlertCircle,
  FilePlus2,
  FolderOpen,
  Gamepad2,
  ShieldCheck,
  LogIn,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  UserRound,
  UsersRound,
} from "lucide-react"
import { BrowsePage } from "@/components/browse-page"
import { ResourceDetailsPage } from "@/components/resource-details-page"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { adminNavigationPreferenceEvent, adminNavigationPreferenceKey, readAdminNavigationPreference } from "@/lib/admin-navigation-preference"
import { profileInitials } from "@/lib/profile"

const AuthPage = lazy(() => import("@/components/auth-page").then(({ AuthPage: page }) => ({ default: page })))
const AccountPage = lazy(() => import("@/components/account-page").then(({ AccountPage: page }) => ({ default: page })))
const PeoplePage = lazy(() => import("@/components/people-page").then(({ PeoplePage: page }) => ({ default: page })))
const PublicProfilePage = lazy(() => import("@/components/public-profile-page").then(({ PublicProfilePage: page }) => ({ default: page })))
const SubmitPage = lazy(() => import("@/components/submit-page").then(({ SubmitPage: page }) => ({ default: page })))
const AdminPage = lazy(() => import("@/components/admin-page").then(({ AdminPage: page }) => ({ default: page })))
const AdminReportsPage = lazy(() => import("@/components/admin-reports-page").then(({ AdminReportsPage: page }) => ({ default: page })))
const AdminUsersPage = lazy(() => import("@/components/admin-users-page").then(({ AdminUsersPage: page }) => ({ default: page })))
const SettingsPage = lazy(() => import("@/components/settings-page").then(({ SettingsPage: page }) => ({ default: page })))

const primaryLinks = [
  { label: "Browse", to: "/", icon: FolderOpen },
  { label: "People", to: "/people", icon: UsersRound },
  { label: "Submit", to: "/submit", icon: FilePlus2 },
]

const accountLinks = [
  { label: "Log in", to: "/login", icon: LogIn },
]

type ColorScheme = "light" | "dark"
type ColorSchemeOverride = ColorScheme | null

function readColorSchemeOverride(): ColorSchemeOverride {
  try {
    const value = window.localStorage.getItem("color-scheme")
    return value === "light" || value === "dark" ? value : null
  } catch {
    return null
  }
}

function getSystemColorScheme(): ColorScheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyColorScheme(override: ColorSchemeOverride): ColorScheme {
  const scheme = override ?? getSystemColorScheme()
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
  if (meta) meta.content = override ?? "light dark"
  document.documentElement.classList.toggle("dark", scheme === "dark")
  document.documentElement.classList.toggle("light", scheme === "light")
  return scheme
}

function useColorScheme() {
  const [scheme, setScheme] = useState<ColorScheme>(() => readColorSchemeOverride() ?? getSystemColorScheme())

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const syncScheme = () => setScheme(applyColorScheme(readColorSchemeOverride()))
    syncScheme()
    media.addEventListener("change", syncScheme)
    window.addEventListener("storage", syncScheme)
    return () => {
      media.removeEventListener("change", syncScheme)
      window.removeEventListener("storage", syncScheme)
    }
  }, [])

  const toggleScheme = () => {
    const nextScheme = scheme === "dark" ? "light" : "dark"
    const override = nextScheme === getSystemColorScheme() ? null : nextScheme
    try {
      if (override) window.localStorage.setItem("color-scheme", override)
      else window.localStorage.removeItem("color-scheme")
    } catch {
      // Keep the current page usable when storage is unavailable.
    }
    setScheme(applyColorScheme(override))
  }

  return { scheme, toggleScheme }
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="brand" aria-label="FunkinArchive home">
      <span className="brand-mark" aria-hidden="true"><Gamepad2 size={19} strokeWidth={1.8} /></span>
      {!compact && <span className="brand-name">FunkinArchive</span>}
    </Link>
  )
}

function NavItems({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const [signedIn, setSignedIn] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [hideAdminPages, setHideAdminPages] = useState(false)
  const [accountUser, setAccountUser] = useState<{ id: string; name: string; image: string | null; username: string | null } | null>(null)

  useEffect(() => {
    let active = true
    void fetch("/api/auth/get-session")
      .then((response) => response.ok ? response.json() as Promise<{ user?: { id: string; name?: string | null; image?: string | null } | null } | null> : null)
      .then((session) => {
        if (!active) return
        const user = session?.user
        setSignedIn(Boolean(user))
        setAccountUser(user ? { id: user.id, name: user.name ?? "Member", image: user.image ?? null, username: null } : null)
        if (user) {
          void fetch("/api/account/profile", { credentials: "same-origin" })
            .then((response) => response.ok ? response.json() as Promise<{ username?: string }> : null)
            .then((profile) => { if (active && profile?.username) setAccountUser((current) => current ? { ...current, username: profile.username! } : current) })
            .catch(() => {})
          void fetch("/api/admin/check", { credentials: "same-origin" })
            .then((response) => response.ok ? response.json() as Promise<{ isAdmin?: boolean }> : null)
            .then((result) => {
              if (!active) return
              const admin = result?.isAdmin === true
              setIsAdmin(admin)
              setHideAdminPages(admin ? readAdminNavigationPreference(user.id) : false)
            })
            .catch(() => { if (active) { setIsAdmin(false); setHideAdminPages(false) } })
        } else {
          setIsAdmin(false)
          setHideAdminPages(false)
        }
      })
      .catch(() => { if (active) { setSignedIn(false); setIsAdmin(false); setHideAdminPages(false); setAccountUser(null) } })
    function handleProfileUpdate(event: Event) {
      const detail = (event as CustomEvent<{ name?: string; image?: string | null; username?: string }>).detail
      if (detail) setAccountUser((current) => current ? { ...current, ...detail } : current)
    }
    window.addEventListener("funkin-archive:profile-updated", handleProfileUpdate)
    return () => {
      active = false
      window.removeEventListener("funkin-archive:profile-updated", handleProfileUpdate)
    }
  }, [])

  useEffect(() => {
    if (!accountUser) return
    const userId = accountUser.id
    const storageKey = adminNavigationPreferenceKey(userId)
    function handlePreference(event: Event) {
      const detail = (event as CustomEvent<{ userId: string; hidden: boolean }>).detail
      if (detail?.userId === userId) setHideAdminPages(detail.hidden)
    }
    function handleStorage(event: StorageEvent) {
      if (event.key === storageKey) setHideAdminPages(readAdminNavigationPreference(userId))
    }
    window.addEventListener(adminNavigationPreferenceEvent, handlePreference)
    window.addEventListener("storage", handleStorage)
    return () => {
      window.removeEventListener(adminNavigationPreferenceEvent, handlePreference)
      window.removeEventListener("storage", handleStorage)
    }
  }, [accountUser?.id])

  async function handleSignOut() {
    const response = await fetch("/api/auth/sign-out", { method: "POST" })
    if (response.ok) { setSignedIn(false); setIsAdmin(false); setHideAdminPages(false); setAccountUser(null) }
  }

  return (
    <>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {primaryLinks.map(({ label, to, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} onClick={onNavigate} title={compact ? label : undefined} aria-label={compact ? label : undefined} className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}>
            <Icon size={18} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span>
          </NavLink>
        ))}
        {isAdmin && !hideAdminPages && <NavLink to="/admin" onClick={onNavigate} title={compact ? "Admin" : undefined} aria-label={compact ? "Admin" : undefined} className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}>
          <ShieldCheck size={18} strokeWidth={1.8} aria-hidden="true" /><span>Admin</span>
        </NavLink>}
        {signedIn && <NavLink to="/settings" onClick={onNavigate} title={compact ? "Settings" : undefined} aria-label={compact ? "Settings" : undefined} className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}>
          <Settings2 size={18} strokeWidth={1.8} aria-hidden="true" /><span>Settings</span>
        </NavLink>}
      </nav>
      <div className="sidebar-account">
        {signedIn ? <>
          <NavLink to={accountUser ? `/users/${encodeURIComponent(accountUser.username ?? accountUser.id)}` : "/account"} onClick={onNavigate} title={compact ? accountUser?.name ?? "Profile" : undefined} aria-label={compact ? `${accountUser?.name ?? "Profile"} profile` : undefined} className={({ isActive }) => `sidebar-profile-link${isActive ? " is-active" : ""}`}>
            <span className="sidebar-profile-avatar" aria-hidden="true">
              {accountUser?.image ? <img src={accountUser.image} alt="" /> : profileInitials(accountUser?.name ?? "Member") || <UserRound size={18} />}
            </span>
            {!compact && <span className="sidebar-profile-copy"><strong>{accountUser?.name ?? "Profile"}</strong></span>}
          </NavLink>
          <button type="button" className="nav-link sidebar-logout" title={compact ? "Log out" : undefined} aria-label={compact ? "Log out" : undefined} onClick={() => { void handleSignOut() }}>
            <LogOut size={18} strokeWidth={1.8} aria-hidden="true" /><span>Log out</span>
          </button>
        </> : <>
          {accountLinks.map(({ label, to, icon: Icon }) => (
          <NavLink key={to} to={to} onClick={onNavigate} title={compact ? label : undefined} aria-label={compact ? label : undefined} className="nav-link">
            <Icon size={18} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span>
          </NavLink>
          ))}
        </>}
      </div>
    </>
  )
}

function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <aside className={`app-sidebar${collapsed ? " is-collapsed" : ""}`}>
      <div className="sidebar-brand-row">
        <Brand compact={collapsed} />
        <Button className="collapse-sidebar" variant="ghost" size="icon" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed((value) => !value)}>
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </Button>
      </div>
      <div className="sidebar-content">
        <NavItems compact={collapsed} />
      </div>
    </aside>
  )
}

function MobileNavigation() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const title = primaryLinks.find((link) => link.to === location.pathname)?.label ?? (location.pathname === "/admin" ? "Admin" : location.pathname === "/admin/reports" ? "Reports" : location.pathname === "/admin/users" ? "Users" : location.pathname === "/settings" ? "Settings" : location.pathname === "/account" ? null : "FunkinArchive")
  return (
    <header className="mobile-header">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open navigation" />}><Menu size={20} /></SheetTrigger>
        <SheetContent side="left" className="mobile-nav-sheet">
          <SheetHeader className="mobile-sheet-header">
            <Brand />
            <SheetTitle className="sr-only">Site navigation</SheetTitle>
            <SheetDescription className="sr-only">Browse community resources and account pages.</SheetDescription>
          </SheetHeader>
          <div className="mobile-sheet-links"><NavItems onNavigate={() => setOpen(false)} /></div>
        </SheetContent>
      </Sheet>
      {title && <span className="mobile-page-name">{title}</span>}
      <Brand compact />
    </header>
  )
}

function FuturePage() {
  return (
    <section className="future-page">
      <span className="future-page-icon"><AlertCircle size={20} /></span>
      <h1>Page not found</h1>
      <p>That page doesn’t exist.</p>
      <Button render={<Link to="/" />}>Back to Browse</Button>
    </section>
  )
}

function AppShell({ scheme, onToggleScheme }: { scheme: ColorScheme; onToggleScheme: () => void }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Sidebar />
      <MobileNavigation />
      <main id="main-content" className="app-main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<BrowsePage />} />
          <Route path="/people" element={<Suspense fallback={<section className="people-page" aria-busy="true">Loading people…</section>}><PeoplePage /></Suspense>} />
          <Route path="/resources/:slug/edit" element={<Suspense fallback={<section className="submit-page" aria-busy="true">Loading resource editor…</section>}><SubmitPage /></Suspense>} />
          <Route path="/resources/:slug" element={<ResourceDetailsPage />} />
          <Route path="/submit" element={<Suspense fallback={<section className="submit-page" aria-busy="true">Loading submission form…</section>}><SubmitPage /></Suspense>} />
          <Route path="/admin" element={<Suspense fallback={<section className="admin-page" aria-busy="true">Loading admin…</section>}><AdminPage /></Suspense>} />
          <Route path="/admin/reports" element={<Suspense fallback={<section className="admin-page" aria-busy="true">Loading reports…</section>}><AdminReportsPage /></Suspense>} />
          <Route path="/admin/users" element={<Suspense fallback={<section className="admin-page" aria-busy="true">Loading users…</section>}><AdminUsersPage /></Suspense>} />
          <Route path="/users/:username" element={<Suspense fallback={<section className="public-profile-page" aria-busy="true">Loading profile…</section>}><PublicProfilePage /></Suspense>} />
          <Route path="/settings" element={<Suspense fallback={<section className="settings-page" aria-busy="true">Loading settings…</section>}><SettingsPage scheme={scheme} onToggleScheme={onToggleScheme} /></Suspense>} />
          <Route path="/account" element={<Suspense fallback={<section className="account-page" aria-busy="true">Loading account…</section>}><AccountPage /></Suspense>} />
          <Route path="*" element={<FuturePage />} />
        </Routes>
      </main>
    </div>
  )
}

function AppRoutes({ scheme, onToggleScheme }: { scheme: ColorScheme; onToggleScheme: () => void }) {
  const { pathname } = useLocation()
  if (pathname === "/signup") return <Navigate to="/login" replace />
  if (pathname === "/login") return <Suspense fallback={<main className="auth-page" aria-busy="true">Loading account page...</main>}><AuthPage /></Suspense>
  return <AppShell scheme={scheme} onToggleScheme={onToggleScheme} />
}

export default function App() {
  const { scheme, toggleScheme } = useColorScheme()
  return <BrowserRouter><AppRoutes scheme={scheme} onToggleScheme={toggleScheme} /></BrowserRouter>
}
