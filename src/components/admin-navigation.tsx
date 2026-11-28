import { NavLink } from "react-router-dom"
import { FileCheck2, Flag, UsersRound } from "lucide-react"

const links = [
  { to: "/admin", label: "Submissions", icon: FileCheck2, end: true },
  { to: "/admin/users", label: "Users", icon: UsersRound, end: false },
  { to: "/admin/reports", label: "Reports", icon: Flag, end: false },
]

export function AdminNavigation() {
  return <nav className="admin-navigation" aria-label="Admin pages">
    {links.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `admin-navigation-link${isActive ? " is-active" : ""}`}>
      <Icon size={16} aria-hidden="true" />{label}
    </NavLink>)}
  </nav>
}
