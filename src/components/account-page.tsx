import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react"
import { ImageOff, Pencil, UserRound, X } from "lucide-react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { ResourceTypePills } from "@/components/resource-type-pills"
import { ProfileResourceControls } from "@/components/profile-resource-controls"
import { StarMeter } from "@/components/resource-rating"
import { ImageCropper, type ImageCropSettings } from "@/components/image-cropper"
import { ImagePicker } from "@/components/image-picker"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { fetchAccountProfile, fetchAccountResources, saveAccountProfile, uploadAccountImage, type AccountResourcesResult } from "@/data/account-api"
import { cropAndCompressImage, maxSourceImageSize } from "@/data/crop-image"
import { getResourceTypes, type ResourceListing } from "@/data/resources"
import { authClient } from "@/lib/auth-client"
import { profileInitials } from "@/lib/profile"

function getInitials(name: string) {
  return profileInitials(name)
}

const defaultCrop: ImageCropSettings = { crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null }
const acceptedImageTypes = ["image/jpeg", "image/png", "image/webp"]

function imageSelectionError(file: File): string | null {
  if (!acceptedImageTypes.includes(file.type)) return "Choose a JPG, PNG, or WebP image."
  if (file.size > maxSourceImageSize) return "Choose an original image smaller than 20 MB."
  return null
}

function useSelectedImage() {
  const [selection, setSelection] = useState<{ file: File; url: string } | null>(null)

  useEffect(() => {
    if (!selection) return
    const { url } = selection
    return () => URL.revokeObjectURL(url)
  }, [selection])

  function selectImage(file: File | null) {
    setSelection(file ? { file, url: URL.createObjectURL(file) } : null)
  }

  return { selection, selectImage }
}

function ProfileAvatar({ image, name }: { image: string | null; name: string }) {
  const [failed, setFailed] = useState(false)

  return (
    <div className="account-avatar" aria-hidden="true">
      {image && !failed
        ? <img src={image} alt="" onError={() => setFailed(true)} />
        : getInitials(name) || <UserRound size={28} strokeWidth={1.6} />}
    </div>
  )
}

function ImageCropDialog({ open, onOpenChange, imageUrl, label, aspectRatio, crop, onCropChange, onApply }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  imageUrl: string
  label: string
  aspectRatio: number
  crop: ImageCropSettings
  onCropChange: Dispatch<SetStateAction<ImageCropSettings>>
  onApply: () => void
}) {
  const titleId = useId()
  const hintId = useId()

  return (
    <Dialog open={open} onOpenChange={onOpenChange} labelledBy={titleId} describedBy={hintId} className="crop-dialog">
      <header className="ui-dialog-header">
        <div>
          <h2 id={titleId}>Adjust {label.toLowerCase()}</h2>
        </div>
        <Button type="button" variant="ghost" size="icon" className="ui-dialog-close" aria-label="Close crop editor" onClick={() => onOpenChange(false)}><X size={18} /></Button>
      </header>
      <div className="ui-dialog-body crop-dialog-body">
        <ImageCropper imageUrl={imageUrl} label={label} aspectRatio={aspectRatio} crop={crop} onCropChange={onCropChange} hintId={hintId} />
      </div>
      <footer className="ui-dialog-footer">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="button" onClick={onApply}>Apply</Button>
      </footer>
    </Dialog>
  )
}

function SubmissionCard({ resource }: { resource: ResourceListing }) {
  return (
    <Link className="resource-card-link" to={"/resources/" + resource.slug}>
      <article className="resource-card account-resource-card">
        <div className="resource-art">
          {resource.coverUrl
            ? <img src={resource.coverUrl} alt={"Cover for " + resource.title} loading="lazy" />
            : <div className="resource-art-placeholder" aria-hidden="true"><ImageOff size={22} /></div>}
          <ResourceTypePills types={getResourceTypes(resource)} />
        </div>
        <div className="resource-card-body">
          <h3 className="resource-card-title">{resource.title}</h3>
          {resource.ratingAverage != null && resource.ratingCount ? <p className="profile-resource-rating"><StarMeter value={resource.ratingAverage} /><span>{resource.ratingAverage.toFixed(1)} · {resource.ratingCount}</span></p> : null}
          {resource.originalBy && <p className="account-resource-original">Original By <span>{resource.originalBy}</span></p>}
        </div>
      </article>
    </Link>
  )
}

export function AccountPage() {
  const { data: authData, isPending: sessionPending } = authClient.useSession()
  const user = authData?.user ?? null
  const navigate = useNavigate()

  useEffect(() => {
    document.title = "Profile - FunkinArchive"
    return () => { document.title = "Browse - FunkinArchive" }
  }, [])

  useEffect(() => {
    if (!sessionPending && !user) navigate("/login", { replace: true })
  }, [sessionPending, user, navigate])

  if (sessionPending || !user) {
    return <main className="account-page" aria-busy={sessionPending}><p className="account-loading" role="status">Loading account…</p></main>
  }

  return <AccountContent key={user.id} user={user} />
}

export type AccountUser = NonNullable<ReturnType<typeof authClient.useSession>["data"]>["user"]

export function AccountContent({ user }: { user: AccountUser }) {
  const [params, setParams] = useSearchParams()
  const resourceParams = new URLSearchParams(params)
  resourceParams.delete("page")
  resourceParams.delete("limit")
  const resourceQueryString = resourceParams.toString()
  const [profileName, setProfileName] = useState(user.name ?? "")
  const [profileImage, setProfileImage] = useState<string | null>(user.image ?? null)
  const [displayName, setDisplayName] = useState(user.name ?? "")
  const [profileBio, setProfileBio] = useState("")
  const [displayBio, setDisplayBio] = useState("")
  const bioInputRef = useRef<HTMLTextAreaElement>(null)
  const [profileBanner, setProfileBanner] = useState<string | null>(null)
  const { selection: avatarImage, selectImage: selectAvatarImage } = useSelectedImage()
  const { selection: bannerImage, selectImage: selectBannerImage } = useSelectedImage()
  const [avatarCrop, setAvatarCrop] = useState(defaultCrop)
  const [bannerCrop, setBannerCrop] = useState(defaultCrop)
  const [avatarCropDraft, setAvatarCropDraft] = useState(defaultCrop)
  const [bannerCropDraft, setBannerCropDraft] = useState(defaultCrop)
  const [cropDialog, setCropDialog] = useState<"avatar" | "banner" | null>(null)
  const [cropDialogFresh, setCropDialogFresh] = useState(false)
  const [removeProfileImage, setRemoveProfileImage] = useState(false)
  const [removeProfileBanner, setRemoveProfileBanner] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileReady, setProfileReady] = useState(false)
  const [profileRetryCount, setProfileRetryCount] = useState(0)
  const [savePending, setSavePending] = useState(false)
  const [feedback, setFeedback] = useState("")
  const [profileError, setProfileError] = useState("")
  const [resources, setResources] = useState<ResourceListing[]>([])
  const [resourcesLoading, setResourcesLoading] = useState(true)
  const [resourcesError, setResourcesError] = useState("")
  const [resourcePage, setResourcePage] = useState<AccountResourcesResult>()
  const [loadedResourcesKey, setLoadedResourcesKey] = useState("")
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState("")
  const [retryCount, setRetryCount] = useState(0)
  const resourceRequestKey = `${user.id}:${resourceQueryString}:${retryCount}`
  const activeResourcesLoading = resourcesLoading || loadedResourcesKey !== resourceRequestKey
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
  const loadMoreControllerRef = useRef<AbortController | null>(null)
  const loadingMoreRef = useRef(false)

  useLayoutEffect(() => {
    const textarea = bioInputRef.current
    if (!textarea) return
    textarea.style.height = "auto"
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [displayBio, editingProfile])

  function chooseProfileImage(type: "avatar" | "banner", file: File | null) {
    const error = file ? imageSelectionError(file) : null
    if (error) {
      setProfileError(error)
      return
    }
    if (type === "avatar") {
      selectAvatarImage(file)
      setAvatarCrop(defaultCrop)
      setAvatarCropDraft(defaultCrop)
      setRemoveProfileImage(false)
    } else {
      selectBannerImage(file)
      setBannerCrop(defaultCrop)
      setBannerCropDraft(defaultCrop)
      setRemoveProfileBanner(false)
    }
    setProfileError("")
    setCropDialogFresh(Boolean(file))
    setCropDialog(file ? type : null)
  }

  function openProfileCrop(type: "avatar" | "banner") {
    const selection = type === "avatar" ? avatarImage : bannerImage
    if (!selection) return
    if (type === "avatar") setAvatarCropDraft(avatarCrop)
    else setBannerCropDraft(bannerCrop)
    setCropDialogFresh(false)
    setCropDialog(type)
  }

  function closeProfileCrop(apply: boolean) {
    if (cropDialog && apply) {
      if (cropDialog === "avatar") setAvatarCrop(avatarCropDraft)
      else setBannerCrop(bannerCropDraft)
    } else if (cropDialog && cropDialogFresh) {
      if (cropDialog === "avatar") selectAvatarImage(null)
      else selectBannerImage(null)
    }
    setCropDialogFresh(false)
    setCropDialog(null)
  }

  useEffect(() => {
    const controller = new AbortController()
    loadMoreControllerRef.current?.abort()
    loadingMoreRef.current = false
    setLoadingMore(false)
    setMoreError("")
    setResources([])
    setResourcePage(undefined)
    setResourcesError("")
    setResourcesLoading(true)
    const requestParams = new URLSearchParams(resourceQueryString)
    requestParams.set("page", "1")
    requestParams.set("limit", "24")
    const timeout = window.setTimeout(() => { void fetchAccountResources(requestParams, controller.signal)
      .then((result) => {
        setResources(result.resources)
        setResourcePage(result)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return
        setResourcesError(cause instanceof Error ? cause.message : "Could not load your submissions.")
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setResourcesLoading(false)
          setLoadedResourcesKey(resourceRequestKey)
        }
      }) }, params.get("q") ? 250 : 0)
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
      loadMoreControllerRef.current?.abort()
      loadMoreControllerRef.current = null
      loadingMoreRef.current = false
    }
  }, [user.id, resourceQueryString, resourceRequestKey])

  const loadMore = useCallback(async () => {
    if (!resourcePage || resourcesLoading || loadingMoreRef.current || resourcePage.page >= resourcePage.pageCount) return
    const controller = new AbortController()
    loadMoreControllerRef.current = controller
    loadingMoreRef.current = true
    setLoadingMore(true)
    setMoreError("")
    const requestParams = new URLSearchParams(resourceQueryString)
    requestParams.set("page", String(resourcePage.page + 1))
    requestParams.set("limit", "24")
    try {
      const result = await fetchAccountResources(requestParams, controller.signal)
      if (!controller.signal.aborted) {
        setResources((current) => {
          const loadedIds = new Set(current.map((resource) => resource.id))
          return [...current, ...result.resources.filter((resource) => !loadedIds.has(resource.id))]
        })
        setResourcePage(result)
      }
    } catch (cause: unknown) {
      if (cause instanceof DOMException && cause.name === "AbortError") return
      setMoreError(cause instanceof Error ? cause.message : "Could not load more submissions.")
    } finally {
      if (!controller.signal.aborted) {
        loadingMoreRef.current = false
        loadMoreControllerRef.current = null
        setLoadingMore(false)
      }
    }
  }, [resourcePage, resourcesLoading, resourceQueryString])

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current
    if (!sentinel || !resourcePage || resourcesLoading || moreError || resourcePage.page >= resourcePage.pageCount || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore()
    }, { rootMargin: "600px 0px" })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore, moreError, resourcePage, resourcesLoading])

  useEffect(() => {
    const controller = new AbortController()
    fetchAccountProfile(controller.signal)
      .then(({ bio, banner }) => {
        setProfileBio(bio)
        setProfileBanner(banner)
        setProfileError("")
        setProfileReady(true)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return
        setProfileError(cause instanceof Error ? cause.message : "Profile details could not be loaded.")
      })
    return () => controller.abort()
  }, [user.id, profileRetryCount])

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavePending(true)
    setFeedback("")
    setProfileError("")
    try {
      const nextName = displayName.trim()
      let nextImage = removeProfileImage ? null : profileImage
      let nextBanner = removeProfileBanner ? null : profileBanner
      if (avatarImage) {
        const croppedFile = await cropAndCompressImage(avatarImage.file, avatarCrop, { width: 512, height: 512 })
        nextImage = await uploadAccountImage(croppedFile)
      }
      if (bannerImage) {
        const croppedFile = await cropAndCompressImage(bannerImage.file, bannerCrop, { width: 1500, height: 500 })
        nextBanner = await uploadAccountImage(croppedFile)
      }
      const nextBio = displayBio.trim()
      await saveAccountProfile({ name: nextName, image: nextImage, bio: nextBio, banner: nextBanner })
      setProfileName(nextName)
      setProfileImage(nextImage)
      setProfileBio(nextBio)
      setProfileBanner(nextBanner)
      selectAvatarImage(null)
      selectBannerImage(null)
      setRemoveProfileImage(false)
      setRemoveProfileBanner(false)
      setEditingProfile(false)
      setFeedback("Profile saved.")
      window.dispatchEvent(new CustomEvent("funkin-archive:profile-updated", { detail: { name: nextName, image: nextImage } }))
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : "Profile could not be saved.")
    } finally {
      setSavePending(false)
    }
  }

  function startEditingProfile() {
    setDisplayName(profileName)
    setDisplayBio(profileBio)
    selectAvatarImage(null)
    selectBannerImage(null)
    setAvatarCrop(defaultCrop)
    setBannerCrop(defaultCrop)
    setRemoveProfileImage(false)
    setRemoveProfileBanner(false)
    setProfileError("")
    setFeedback("")
    setEditingProfile(true)
  }

  function cancelProfileEdit() {
    closeProfileCrop(false)
    setDisplayName(profileName)
    setDisplayBio(profileBio)
    selectAvatarImage(null)
    selectBannerImage(null)
    setAvatarCrop(defaultCrop)
    setBannerCrop(defaultCrop)
    setRemoveProfileImage(false)
    setRemoveProfileBanner(false)
    setProfileError("")
    setEditingProfile(false)
  }

  const profileCard = (
    <section className={`account-profile-card${editingProfile ? " is-editing" : ""}`} aria-labelledby="account-profile-heading">
        {editingProfile && <h2 id="account-profile-heading" className="sr-only">Edit profile</h2>}
        {profileError && !editingProfile && <div className="account-profile-load-error" role="alert"><p>{profileError}</p><Button type="button" variant="outline" size="sm" onClick={() => setProfileRetryCount((count) => count + 1)}>Retry</Button></div>}
        <div className={`account-profile-banner${editingProfile ? " is-editing" : ""}`}>
          {editingProfile ? (
            <>
              <ImagePicker
                id="account-banner-file"
                name="banner"
                label="Profile banner"
                accept="image/jpeg,image/png,image/webp"
                aspectRatio={3}
                layout="banner"
                presentation="profile"
                imageUrl={bannerImage?.url ?? (removeProfileBanner ? null : profileBanner)}
                fileName={bannerImage?.file.name}
                removeLabel="Remove banner"
                onSelect={(file) => chooseProfileImage("banner", file)}
                onAdjust={() => openProfileCrop("banner")}
                onRemove={(profileBanner || bannerImage) ? () => { selectBannerImage(null); setBannerCrop(defaultCrop); setRemoveProfileBanner(true) } : undefined}
              />
              <div className="account-profile-visual-content account-profile-edit-content">
                <ImagePicker
                  id="account-avatar-file"
                  name="avatar"
                  label="Profile picture"
                  accept="image/jpeg,image/png,image/webp"
                  aspectRatio={1}
                  layout="avatar"
                  presentation="profile"
                  imageUrl={avatarImage?.url ?? (removeProfileImage ? null : profileImage)}
                  fileName={avatarImage?.file.name}
                  removeLabel="Remove picture"
                  removeDisabled={!profileImage && !avatarImage}
                  onSelect={(file) => chooseProfileImage("avatar", file)}
                  onAdjust={() => openProfileCrop("avatar")}
                  onRemove={() => { selectAvatarImage(null); setAvatarCrop(defaultCrop); setRemoveProfileImage(true) }}
                />
                <div className="account-profile-visual-copy account-profile-edit-copy">
                  <label className="sr-only" htmlFor="account-display-name">Display name</label>
                  <Input id="account-display-name" name="name" autoComplete="name" autoFocus size={Math.max(1, Math.min(displayName.length, 40))} value={displayName} onChange={(event) => setDisplayName(event.currentTarget.value)} maxLength={80} required className="account-edit-name-input" />
                </div>
              </div>
            </>
          ) : (
            <>
              {profileBanner && <img src={profileBanner} alt="" />}
              <div className="account-profile-visual-content">
                <ProfileAvatar key={profileImage ?? "no-image"} image={profileImage} name={profileName} />
                <div className="account-profile-visual-copy"><h2 id="account-profile-heading">{profileName || "Your account"}</h2></div>
              </div>
            </>
          )}
        </div>
        <div className={`account-profile-details-row${editingProfile ? " is-editing" : ""}`}>
          {editingProfile ? (
            <div className="auth-field account-edit-bio-field">
              <label className="sr-only" htmlFor="account-profile-bio">Bio</label>
              <textarea ref={bioInputRef} id="account-profile-bio" name="bio" className="auth-input account-bio-input" value={displayBio} onChange={(event) => setDisplayBio(event.currentTarget.value)} maxLength={160} rows={1} aria-describedby="account-bio-help" />
              <p id="account-bio-help" className="account-profile-help">{displayBio.length}/160 characters</p>
            </div>
          ) : (
            <>
              {profileBio && <p className="account-profile-bio">{profileBio}</p>}
              <Button type="button" className="account-edit-profile" variant="outline" disabled={!profileReady} onClick={startEditingProfile}><Pencil size={14} />Edit profile</Button>
            </>
          )}
          {editingProfile && <div className="account-profile-edit-actions">
            <Button type="button" variant="outline" disabled={savePending} onClick={cancelProfileEdit}>Cancel</Button>
            <Button type="submit" disabled={savePending}>{savePending ? "Saving..." : "Save changes"}</Button>
          </div>}
        </div>
        {profileError && editingProfile && <p role="alert" className="auth-feedback account-inline-profile-error">{profileError}</p>}
        {feedback && <p className="account-upload-feedback" role="status">{feedback}</p>}
      </section>
  )

  const query = params.get("q") ?? ""
  const type = params.get("type") ?? "all"
  const minRating = params.get("minRating") ?? "all"
  const sort = params.get("sort") ?? "newest"
  const activeResourcesError = loadedResourcesKey === resourceRequestKey ? resourcesError : ""
  function updateResourceParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value && value !== "all" && !(key === "sort" && value === "newest")) next.set(key, value)
    else next.delete(key)
    next.delete("page")
    next.delete("limit")
    setParams(next, { replace: true })
  }
  function resetResourceFilters() { setParams(new URLSearchParams(), { replace: true }) }

  return (
    <div className="account-page">
      {editingProfile ? <form className="account-profile-inline-form" onSubmit={saveProfile}>{profileCard}</form> : profileCard}
      {cropDialog === "avatar" && avatarImage && <ImageCropDialog open onOpenChange={(open) => { if (open) setCropDialog("avatar"); else closeProfileCrop(false) }} imageUrl={avatarImage.url} label="Profile picture" aspectRatio={1} crop={avatarCropDraft} onCropChange={setAvatarCropDraft} onApply={() => closeProfileCrop(true)} />}
      {cropDialog === "banner" && bannerImage && <ImageCropDialog open onOpenChange={(open) => { if (open) setCropDialog("banner"); else closeProfileCrop(false) }} imageUrl={bannerImage.url} label="Profile banner" aspectRatio={3} crop={bannerCropDraft} onCropChange={setBannerCropDraft} onApply={() => closeProfileCrop(true)} />}

      <section id="submitted-resources" className="account-submissions" aria-label="Submitted resources">
        <ProfileResourceControls query={query} type={type} minRating={minRating} sort={sort} types={resourcePage?.facets.types ?? []} onQueryChange={(value) => updateResourceParam("q", value)} onChange={updateResourceParam} onReset={resetResourceFilters} />
        {activeResourcesLoading ? (
          <div className="resource-grid" aria-label="Loading submitted resources" aria-busy="true">
            {[0, 1, 2].map((index) => <div key={index} className="resource-card resource-card-skeleton"><div className="skeleton-cover" /><div className="skeleton-lines"><span /><span /></div></div>)}
          </div>
        ) : activeResourcesError ? (
          <div className="account-submissions-empty" role="alert"><p>{activeResourcesError}</p><Button variant="outline" onClick={() => { setResourcesLoading(true); setResourcesError(""); setRetryCount((count) => count + 1) }}>Retry</Button></div>
        ) : resources.length > 0 ? (
          <>
            <div className="resource-grid">{resources.map((resource) => <SubmissionCard key={resource.id} resource={resource} />)}</div>
            <p className="infinite-scroll-count" role="status">Showing {resources.length} of {resourcePage?.total ?? resources.length} resources</p>
            {resourcePage && resourcePage.page < resourcePage.pageCount && <>
              <div ref={loadMoreSentinelRef} className="infinite-scroll-sentinel" aria-hidden="true" />
              <div className="infinite-scroll-controls">
                {loadingMore ? <p role="status">Loading more resources…</p> : moreError ? <div className="infinite-scroll-error" role="alert"><span>{moreError}</span><Button variant="outline" size="sm" onClick={() => void loadMore()}>Retry</Button></div> : <Button variant="outline" size="sm" onClick={() => void loadMore()}>Load more resources</Button>}
              </div>
            </>}
            {resourcePage && resourcePage.page >= resourcePage.pageCount && <p className="infinite-scroll-end" role="status">You’ve reached the end of your submissions.</p>}
          </>
        ) : (
          <div className="account-submissions-empty"><p>{query || type !== "all" || minRating !== "all" ? "No resources match these filters." : "You haven't submitted any resources yet."}</p>{query || type !== "all" || minRating !== "all" ? <Button variant="outline" onClick={resetResourceFilters}>Clear search and filters</Button> : <Button variant="outline" nativeButton={false} render={<Link to="/submit" />}>Submit a resource</Button>}</div>
        )}
      </section>
    </div>
  )
}
