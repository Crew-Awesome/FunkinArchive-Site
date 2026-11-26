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
  UserRound,
} from "lucide-react"
import { BrowsePage } from "@/components/browse-page"
import { ResourceDetailsPage } from "@/components/resource-details-page"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { profileInitials } from "@/lib/profile"

const AuthPage = lazy(() => import("@/components/auth-page").then(({ AuthPage: page }) => ({ default: page })))
const AccountPage = lazy(() => import("@/components/account-page").then(({ AccountPage: page }) => ({ default: page })))
const PublicProfilePage = lazy(() => import("@/components/public-profile-page").then(({ PublicProfilePage: page }) => ({ default: page })))
const SubmitPage = lazy(() => import("@/components/submit-page").then(({ SubmitPage: page }) => ({ default: page })))
const AdminPage = lazy(() => import("@/components/admin-page").then(({ AdminPage: page }) => ({ default: page })))

const primaryLinks = [
  { label: "Browse", to: "/", icon: FolderOpen },
  { label: "Submit", to: "/submit", icon: FilePlus2 },
]

const accountLinks = [
  { label: "Log in", to: "/login", icon: LogIn },
]

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
  const [accountUser, setAccountUser] = useState<{ id: string; name: string; image: string | null } | null>(null)

  useEffect(() => {
    let active = true
    void fetch("/api/auth/get-session")
      .then((response) => response.ok ? response.json() as Promise<{ user?: { id: string; name?: string | null; image?: string | null } | null } | null> : null)
      .then((session) => {
        if (!active) return
        const user = session?.user
        setSignedIn(Boolean(user))
        setAccountUser(user ? { id: user.id, name: user.name ?? "Member", image: user.image ?? null } : null)
        if (user) {
          void fetch("/api/admin/check", { credentials: "same-origin" })
            .then((response) => response.ok ? response.json() as Promise<{ isAdmin?: boolean }> : null)
            .then((result) => { if (active) setIsAdmin(result?.isAdmin === true) })
            .catch(() => { if (active) setIsAdmin(false) })
        } else {
          setIsAdmin(false)
        }
      })
      .catch(() => { if (active) { setSignedIn(false); setAccountUser(null) } })
    function handleProfileUpdate(event: Event) {
      const detail = (event as CustomEvent<{ name: string; image: string | null }>).detail
      if (detail) setAccountUser((current) => current ? { ...current, name: detail.name, image: detail.image } : current)
    }
    window.addEventListener("funkin-archive:profile-updated", handleProfileUpdate)
    return () => {
      active = false
      window.removeEventListener("funkin-archive:profile-updated", handleProfileUpdate)
    }
  }, [])

  async function handleSignOut() {
    const response = await fetch("/api/auth/sign-out", { method: "POST" })
    if (response.ok) { setSignedIn(false); setIsAdmin(false); setAccountUser(null) }
  }

  return (
    <>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {primaryLinks.map(({ label, to, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} onClick={onNavigate} title={compact ? label : undefined} aria-label={compact ? label : undefined} className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}>
            <Icon size={18} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span>
          </NavLink>
        ))}
        {isAdmin && <NavLink to="/admin" onClick={onNavigate} title={compact ? "Admin" : undefined} aria-label={compact ? "Admin" : undefined} className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}>
          <ShieldCheck size={18} strokeWidth={1.8} aria-hidden="true" /><span>Admin</span>
        </NavLink>}
      </nav>
      <div className="sidebar-account">
        {signedIn ? <>
          <NavLink to={accountUser ? `/users/${encodeURIComponent(accountUser.id)}` : "/account"} onClick={onNavigate} title={compact ? accountUser?.name ?? "Profile" : undefined} aria-label={compact ? `${accountUser?.name ?? "Profile"} profile` : undefined} className={({ isActive }) => `sidebar-profile-link${isActive ? " is-active" : ""}`}>
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
      <div className="sidebar-content"><NavItems compact={collapsed} /></div>
    </aside>
  )
}

function MobileNavigation() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const title = primaryLinks.find((link) => link.to === location.pathname)?.label ?? (location.pathname === "/admin" ? "Admin" : location.pathname === "/account" ? null : "FunkinArchive")
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

function AppShell() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Sidebar />
      <MobileNavigation />
      <main id="main-content" className="app-main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<BrowsePage />} />
          <Route path="/resources/:slug/edit" element={<Suspense fallback={<section className="submit-page" aria-busy="true">Loading resource editor…</section>}><SubmitPage /></Suspense>} />
          <Route path="/resources/:slug" element={<ResourceDetailsPage />} />
          <Route path="/submit" element={<Suspense fallback={<section className="submit-page" aria-busy="true">Loading submission form…</section>}><SubmitPage /></Suspense>} />
          <Route path="/admin" element={<Suspense fallback={<section className="admin-page" aria-busy="true">Loading admin…</section>}><AdminPage /></Suspense>} />
          <Route path="/users/:userId" element={<Suspense fallback={<section className="public-profile-page" aria-busy="true">Loading profile…</section>}><PublicProfilePage /></Suspense>} />
          <Route path="/account" element={<Suspense fallback={<section className="account-page" aria-busy="true">Loading account…</section>}><AccountPage /></Suspense>} />
          <Route path="*" element={<FuturePage />} />
        </Routes>
      </main>
    </div>
  )
}

function AppRoutes() {
  const { pathname } = useLocation()
  if (pathname === "/signup") return <Navigate to="/login" replace />
  if (pathname === "/login") return <Suspense fallback={<main className="auth-page" aria-busy="true">Loading account page...</main>}><AuthPage /></Suspense>
  return <AppShell />
}

export default function App() {
  return <BrowserRouter><AppRoutes /></BrowserRouter>
}
