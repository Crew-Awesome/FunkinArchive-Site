import { useEffect, useRef, useState, type ReactNode, type FocusEvent } from "react"
import type { PublicProfilePreview } from "@/data/resources"
import { fetchPublicProfilePreview } from "@/data/public-profile-api"

const profilePreviewCache = new Map<string, PublicProfilePreview>()
const profilePreviewRequests = new Map<string, Promise<PublicProfilePreview>>()

function getProfilePreview(userId: string) {
  const cached = profilePreviewCache.get(userId)
  if (cached) return Promise.resolve(cached)
  const pending = profilePreviewRequests.get(userId)
  if (pending) return pending

  const request = fetchPublicProfilePreview(userId)
    .then((profile) => { profilePreviewCache.set(userId, profile); return profile })
    .finally(() => { profilePreviewRequests.delete(userId) })
  profilePreviewRequests.set(userId, request)
  return request
}

export function SubmitterHoverCard({
  userId,
  name,
  image,
  previewId,
  className = "",
  focused = false,
  children,
}: {
  userId: string | null
  name: string
  image: string | null
  previewId: string
  className?: string
  focused?: boolean
  children: ReactNode
}) {
  const [profile, setProfile] = useState<PublicProfilePreview>()
  const [hovered, setHovered] = useState(false)
  const [hasFocus, setHasFocus] = useState(false)
  const openTimer = useRef<number | undefined>(undefined)
  const closeTimer = useRef<number | undefined>(undefined)
  const isOpen = Boolean(userId && (focused || hasFocus || hovered))

  function loadProfile() {
    if (!userId) return
    void getProfilePreview(userId).then(setProfile).catch(() => {})
  }

  function showPreview(delayed = false) {
    window.clearTimeout(closeTimer.current)
    window.clearTimeout(openTimer.current)
    const show = () => { setHovered(true); loadProfile() }
    if (delayed) openTimer.current = window.setTimeout(show, 250)
    else show()
  }

  function hidePreview() {
    window.clearTimeout(openTimer.current)
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setHovered(false), 120)
  }

  function handleBlur(event: FocusEvent<HTMLSpanElement>) {
    const nextTarget = event.relatedTarget
    if (!(nextTarget instanceof Node && event.currentTarget.contains(nextTarget))) setHasFocus(false)
  }

  useEffect(() => {
    if (!focused || !userId) return
    let active = true
    void getProfilePreview(userId).then((result) => { if (active) setProfile(result) }).catch(() => {})
    return () => { active = false }
  }, [focused, userId])

  useEffect(() => () => {
    window.clearTimeout(openTimer.current)
    window.clearTimeout(closeTimer.current)
  }, [])

  const displayName = profile?.name ?? name
  const displayImage = profile?.image ?? image
  const bio = profile?.bio?.trim()

  return (
    <span
      className={`submitter-hovercard-trigger ${className}`}
      onPointerEnter={() => showPreview(true)}
      onPointerLeave={hidePreview}
      onFocusCapture={() => { setHasFocus(true); loadProfile() }}
      onBlurCapture={handleBlur}
    >
      {children}
      {isOpen && <span id={previewId} className="submitter-hovercard" role="tooltip">
        <span className="submitter-hovercard-banner" aria-hidden="true">{profile?.banner && <img src={profile.banner} alt="" loading="lazy" />}</span>
        <span className="submitter-hovercard-content">
          <span className="submitter-hovercard-avatar" aria-hidden="true">{displayImage ? <img src={displayImage} alt="" /> : displayName.slice(0, 1).toUpperCase()}</span>
          <span className="submitter-hovercard-name" title={displayName}>{displayName}</span>
          {bio && <span className="submitter-hovercard-bio">{bio}</span>}
        </span>
      </span>}
    </span>
  )
}
