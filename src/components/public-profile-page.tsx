import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ImageOff, UserRound } from "lucide-react"
import { AccountContent } from "@/components/account-page"
import { ResourceTypePills } from "@/components/resource-type-pills"
import { Button } from "@/components/ui/button"
import { fetchPublicProfile } from "@/data/public-profile-api"
import { getResourceTypes, type PublicProfile } from "@/data/resources"
import { profileInitials } from "@/lib/profile"
import { authClient } from "@/lib/auth-client"

function PublicSubmissionCard({ resource }: { resource: PublicProfile["resources"][number] }) {
  return (
    <Link className="resource-card-link" to={`/resources/${encodeURIComponent(resource.slug)}`}>
      <article className="resource-card">
        <div className="resource-art">
          {resource.coverUrl
            ? <img src={resource.coverUrl} alt={`Cover for ${resource.title}`} loading="lazy" decoding="async" />
            : <div className="resource-art-placeholder" role="img" aria-label={`No cover available for ${resource.title}`}><ImageOff size={22} /></div>}
          <ResourceTypePills types={getResourceTypes(resource)} />
        </div>
        <div className="resource-card-body"><h2 className="resource-card-title">{resource.title}</h2></div>
      </article>
    </Link>
  )
}

export function PublicProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const { data: authData, isPending: sessionPending } = authClient.useSession()
  const [profile, setProfile] = useState<PublicProfile>()
  const [error, setError] = useState<string>()
  const [loadedId, setLoadedId] = useState<string>()
  const ownProfile = Boolean(userId && authData?.user?.id === userId)
  const loading = sessionPending || (!ownProfile && loadedId !== userId)
  const activeError = loadedId === userId ? error : undefined

  useEffect(() => {
    if (!userId || sessionPending || ownProfile) return
    const controller = new AbortController()
    fetchPublicProfile(userId, controller.signal)
      .then((result) => { setProfile(result); setError(undefined) })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return
        setError(cause instanceof Error ? cause.message : "The profile could not be loaded.")
      })
      .finally(() => { if (!controller.signal.aborted) setLoadedId(userId) })
    return () => controller.abort()
  }, [userId, sessionPending, ownProfile])

  useEffect(() => {
    document.title = ownProfile ? `${authData?.user?.name ?? "Profile"} - FunkinArchive` : profile ? `${profile.name} - FunkinArchive` : "Profile - FunkinArchive"
    return () => { document.title = "Browse - FunkinArchive" }
  }, [profile, ownProfile, authData?.user?.name])

  if (loading) return <div className="public-profile-page" aria-busy="true"><p role="status">Loading profile…</p></div>
  if (ownProfile && authData?.user) return <AccountContent key={authData.user.id} user={authData.user} />
  if (activeError || !profile) {
    return <div className="public-profile-page"><section className="details-message" role="status"><h1>Profile unavailable</h1><p>{activeError ?? "This profile could not be found."}</p><Button variant="outline" render={<Link to="/" />}>Back to Browse</Button></section></div>
  }

  return (
    <div className="public-profile-page">
      <section className="account-profile-card" aria-labelledby="public-profile-name">
        <div className="account-profile-banner">
          {profile.banner && <img src={profile.banner} alt="" />}
          <div className="account-profile-visual-content">
            <div className="account-avatar" aria-hidden="true">
              {profile.image ? <img src={profile.image} alt="" /> : profileInitials(profile.name) || <UserRound size={28} strokeWidth={1.6} />}
            </div>
            <div className="account-profile-visual-copy"><h1 id="public-profile-name">{profile.name}</h1></div>
          </div>
        </div>
        {profile.bio && <div className="account-profile-details-row"><p className="account-profile-bio">{profile.bio}</p></div>}
      </section>

      <section className="public-profile-submissions" aria-labelledby="public-profile-submissions-heading">
        <header className="public-profile-submissions-header">
          <h2 id="public-profile-submissions-heading">Submissions</h2>
          <span>{profile.total}</span>
        </header>
        {profile.resources.length > 0
          ? <div className="resource-grid">{profile.resources.map((resource) => <PublicSubmissionCard key={resource.id} resource={resource} />)}</div>
          : <p className="public-profile-empty">No resources submitted yet.</p>}
      </section>
    </div>
  )
}
