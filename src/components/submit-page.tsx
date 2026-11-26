import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type Dispatch, type SetStateAction } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowUpRight, Check, FileText, Link2, LockKeyhole, Music2, Plus, Tag, UserRound, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ImagePicker } from "@/components/image-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ImageCropper, type ImageCropSettings } from "@/components/image-cropper"
import { ResourceTypeIcon } from "@/components/resource-type-icon"
import { fetchAccountResource, submitResource, updateAccountResource, uploadAccountImage } from "@/data/account-api"
import { cropAndCompressImage, maxSourceImageSize } from "@/data/crop-image"
import { knownResourceTypes, type ResourceListing, type ResourceSubmissionInput } from "@/data/resources"
import { authClient } from "@/lib/auth-client"

type SubmissionTab = "resource" | "credits" | "files" | "details"
type SubmissionValues = Omit<ResourceSubmissionInput, "coverUrl">
type FieldErrors = Partial<Record<"title" | "type" | "downloadUrl", string>>

const defaultCrop: ImageCropSettings = { crop: { x: 0, y: 0 }, zoom: 1, croppedAreaPixels: null }
const acceptedImageTypes = ["image/jpeg", "image/png", "image/webp"]
const submissionPolicyStorageKey = "funkin-commons:submission-policy"
const submissionPolicyVersion = "2026-11-24-v1"
const initialValues: SubmissionValues = {
  title: "",
  fromMod: "",
  version: "",
  type: "",
  originalBy: "",
  recreationBy: "",
  downloadUrl: "",
  description: "",
  tags: [],
  alternateDownloads: [],
}

function hasAcceptedCurrentSubmissionPolicy() {
  try {
    return window.localStorage.getItem(submissionPolicyStorageKey) === submissionPolicyVersion
  } catch {
    return false
  }
}

function isWebUrl(value: string) {
  if (!value.trim()) return true
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function CoverCropDialog({ open, onOpenChange, imageUrl, crop, onCropChange, onApply }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  imageUrl: string
  crop: ImageCropSettings
  onCropChange: Dispatch<SetStateAction<ImageCropSettings>>
  onApply: () => void
}) {
  const titleId = useId()
  const hintId = useId()

  return (
    <Dialog open={open} onOpenChange={onOpenChange} labelledBy={titleId} describedBy={hintId} className="crop-dialog">
      <header className="ui-dialog-header">
        <h2 id={titleId}>Adjust cover image</h2>
        <Button type="button" variant="ghost" size="icon" className="ui-dialog-close" aria-label="Close crop editor" onClick={() => onOpenChange(false)}><X size={18} /></Button>
      </header>
      <div className="ui-dialog-body crop-dialog-body">
        <ImageCropper imageUrl={imageUrl} label="Resource cover" aspectRatio={16 / 9} crop={crop} onCropChange={onCropChange} hintId={hintId} />
      </div>
      <footer className="ui-dialog-footer">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="button" onClick={onApply}>Apply</Button>
      </footer>
    </Dialog>
  )
}

export function SubmitPage() {
  const { slug: editSlug } = useParams<{ slug?: string }>()
  const navigate = useNavigate()
  const { data: session, isPending: sessionPending } = authClient.useSession()
  const sessionUserId = session?.user?.id
  const [tab, setTab] = useState<SubmissionTab>("resource")
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [requestError, setRequestError] = useState("")
  const [submittedSlug, setSubmittedSlug] = useState("")
  const [tagDraft, setTagDraft] = useState("")
  const [alternateDownloadDraft, setAlternateDownloadDraft] = useState("")
  const [alternateDownloadError, setAlternateDownloadError] = useState("")
  const [coverImage, setCoverImage] = useState<{ file: File; url: string } | null>(null)
  const [coverCrop, setCoverCrop] = useState(defaultCrop)
  const [coverCropDraft, setCoverCropDraft] = useState(defaultCrop)
  const [coverCropOpen, setCoverCropOpen] = useState(false)
  const [coverCropFresh, setCoverCropFresh] = useState(false)
  const [coverImageError, setCoverImageError] = useState("")
  const [uploadedCoverUrl, setUploadedCoverUrl] = useState("")
  const [pending, setPending] = useState(false)
  const [editingResource, setEditingResource] = useState<ResourceListing>()
  const [loadedEditSlug, setLoadedEditSlug] = useState<string>()
  const [editLoadError, setEditLoadError] = useState("")
  const [editLoadRetry, setEditLoadRetry] = useState(0)
  const [coverRemoved, setCoverRemoved] = useState(false)
  const [submissionsLocked, setSubmissionsLocked] = useState<boolean | null>(editSlug ? false : null)
  const [guidelinesChecked, setGuidelinesChecked] = useState(false)
  const [guidelinesAccepted, setGuidelinesAccepted] = useState(hasAcceptedCurrentSubmissionPolicy)
  const guidelinesTitleId = useId()
  const titleRef = useRef<HTMLInputElement>(null)
  const typeRef = useRef<HTMLButtonElement>(null)
  const downloadUrlRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!coverImage) return
    const { url } = coverImage
    return () => URL.revokeObjectURL(url)
  }, [coverImage])

  useEffect(() => {
    document.title = editSlug ? "Edit resource - FunkinArchive" : "Submit a resource - FunkinArchive"
    return () => { document.title = "Browse - FunkinArchive" }
  }, [editSlug])

  useEffect(() => {
    if (editSlug) return
    const controller = new AbortController()
    void fetch("/api/submissions/status", { signal: controller.signal, credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not read submission status.")
        const result = await response.json() as { submissionsLocked?: boolean }
        setSubmissionsLocked(result.submissionsLocked === true)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return
        setSubmissionsLocked(false)
      })
    return () => controller.abort()
  }, [editSlug])

  useEffect(() => {
    if (!editSlug || sessionPending || !sessionUserId) return
    const controller = new AbortController()
    fetchAccountResource(editSlug, controller.signal)
      .then((resource) => {
        setEditingResource(resource)
        setValues({
          title: resource.title,
          fromMod: resource.fromMod ?? "",
          version: resource.version ?? "",
          type: resource.fileType || resource.category || "",
          originalBy: resource.originalBy ?? "",
          recreationBy: resource.recreationBy ?? "",
          downloadUrl: resource.downloadUrl ?? "",
          description: resource.description ?? "",
          tags: resource.tags ?? [],
          alternateDownloads: resource.alternateDownloads ?? [],
        })
        setCoverRemoved(false)
        setSubmittedSlug("")
        setErrors({})
        setRequestError("")
        setLoadedEditSlug(editSlug)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return
        setEditLoadError(cause instanceof Error ? cause.message : "Could not load this resource for editing.")
        setLoadedEditSlug(editSlug)
      })
    return () => controller.abort()
  }, [editSlug, sessionPending, sessionUserId, editLoadRetry])

  function updateValue<Key extends keyof SubmissionValues>(key: Key, value: SubmissionValues[Key]) {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setRequestError("")
    setSubmittedSlug("")
  }

  function addTag() {
    const tag = tagDraft.trim().replace(/,$/, "")
    if (!tag) return
    if (!values.tags.some((current) => current.toLocaleLowerCase() === tag.toLocaleLowerCase())) {
      updateValue("tags", [...values.tags, tag])
    }
    setTagDraft("")
  }

  function handleTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault()
      addTag()
    } else if (event.key === "Backspace" && !tagDraft && values.tags.length > 0) {
      updateValue("tags", values.tags.slice(0, -1))
    }
  }

  function addAlternateDownload() {
    const url = alternateDownloadDraft.trim()
    if (!url) return
    if (!isWebUrl(url)) {
      setAlternateDownloadError("Enter a valid HTTP or HTTPS URL.")
      return
    }
    if (values.alternateDownloads.some((current) => current.toLowerCase() === url.toLowerCase())) {
      setAlternateDownloadError("That download link has already been added.")
      return
    }
    if (values.alternateDownloads.length >= 10) {
      setAlternateDownloadError("You can add up to 10 alternative downloads.")
      return
    }
    updateValue("alternateDownloads", [...values.alternateDownloads, url])
    setAlternateDownloadDraft("")
    setAlternateDownloadError("")
  }

  function handleAlternateDownloadKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault()
      addAlternateDownload()
    }
  }

  function chooseCoverImage(file: File | null) {
    if (!file) return
    if (!acceptedImageTypes.includes(file.type)) {
      setCoverImageError("Choose a JPG, PNG, or WebP image.")
      return
    }
    if (file.size > maxSourceImageSize) {
      setCoverImageError("Choose an original image smaller than 20 MB.")
      return
    }
    setCoverImage({ file, url: URL.createObjectURL(file) })
    setCoverRemoved(false)
    setCoverCrop(defaultCrop)
    setCoverCropDraft(defaultCrop)
    setCoverCropFresh(true)
    setCoverCropOpen(true)
    setCoverImageError("")
    setUploadedCoverUrl("")
  }

  function openCoverCrop() {
    if (!coverImage) return
    setCoverCropDraft(coverCrop)
    setCoverCropFresh(false)
    setCoverCropOpen(true)
  }

  function closeCoverCrop(apply: boolean) {
    if (apply) {
      setCoverCrop(coverCropDraft)
      setUploadedCoverUrl("")
    } else if (coverCropFresh) {
      setCoverImage(null)
      setUploadedCoverUrl("")
    }
    setCoverCropFresh(false)
    setCoverCropOpen(false)
  }

  function focusField(field: keyof FieldErrors) {
    window.requestAnimationFrame(() => {
      if (field === "title") titleRef.current?.focus()
      else if (field === "type") typeRef.current?.focus()
      else if (field === "downloadUrl") downloadUrlRef.current?.focus()
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!guidelinesAccepted) return
    const nextErrors: FieldErrors = {}
    if (!values.title.trim()) nextErrors.title = "Enter a resource title."
    if (!values.type) nextErrors.type = "Choose one resource type."
    const unchangedHostedDownload = Boolean(editingResource?.downloadUrl?.startsWith("/api/assets?") && editingResource.downloadUrl === values.downloadUrl)
    if (!isWebUrl(values.downloadUrl) && !unchangedHostedDownload) nextErrors.downloadUrl = "Enter a valid HTTP or HTTPS URL."
    setErrors(nextErrors)
    setRequestError("")
    if (Object.keys(nextErrors).length > 0) {
      const firstInvalid = Object.keys(nextErrors)[0] as keyof FieldErrors
      setTab(firstInvalid === "downloadUrl" ? "files" : "resource")
      focusField(firstInvalid)
      return
    }

    setPending(true)
    try {
      let coverUrl = uploadedCoverUrl
      if (coverImage && !coverUrl) {
        const croppedFile = await cropAndCompressImage(coverImage.file, coverCrop, { width: 1280, height: 720 })
        coverUrl = await uploadAccountImage(croppedFile)
        setUploadedCoverUrl(coverUrl)
      }
      const input: ResourceSubmissionInput = {
        title: values.title.trim(),
        fromMod: values.fromMod.trim(),
        version: values.version.trim(),
        type: values.type,
        originalBy: values.originalBy.trim(),
        recreationBy: values.recreationBy.trim(),
        coverUrl: coverUrl ?? "",
        downloadUrl: values.downloadUrl.trim(),
        description: values.description.trim(),
        tags: values.tags,
        alternateDownloads: values.alternateDownloads,
      }
      if (editSlug) {
        const resource = await updateAccountResource(editSlug, input, coverImage || coverRemoved ? coverUrl || null : undefined)
        navigate(`/resources/${encodeURIComponent(resource.slug)}`, { replace: true })
        return
      }
      const resource = await submitResource(input)
      setEditingResource(resource)
      setCoverImage(null)
      setCoverRemoved(false)
      setUploadedCoverUrl("")
      setSubmittedSlug(resource.slug)
    } catch (cause) {
      setRequestError(cause instanceof Error ? cause.message : "The resource could not be submitted.")
    } finally {
      setPending(false)
    }
  }

  function acceptSubmissionPolicy() {
    setGuidelinesAccepted(true)
    try {
      window.localStorage.setItem(submissionPolicyStorageKey, submissionPolicyVersion)
    } catch {
      // Keep this visit usable when browser storage is unavailable.
    }
  }

  if (sessionPending) return <section className="submit-page" aria-busy="true"><p role="status">Loading account…</p></section>

  if (!session?.user) {
    return (
      <section className="submit-page">
        <div className="submit-auth-message"><UserRound size={18} aria-hidden="true" /><p>You need an account to submit a resource.</p><Button render={<Link to="/login" />}>Log in</Button></div>
      </section>
    )
  }

  if (!editSlug && submissionsLocked === null) return <section className="submit-page" aria-busy="true"><p role="status">Checking submission availability…</p></section>
  if (!editSlug && submissionsLocked) {
    return (
      <section className="submit-page">
        <div className="submit-auth-message" role="status"><LockKeyhole size={18} aria-hidden="true" /><p>New submissions are temporarily locked. Please check back later.</p><Button variant="outline" render={<Link to="/" />}>Back to Browse</Button></div>
      </section>
    )
  }

  if (editSlug && loadedEditSlug !== editSlug) {
    return <section className="submit-page" aria-busy="true"><p role="status">Loading resource to edit…</p></section>
  }
  if (editSlug && editLoadError) {
    return <section className="submit-page"><div className="submit-message submit-message-error" role="alert">{editLoadError}</div><Button type="button" variant="outline" onClick={() => { setEditLoadError(""); setLoadedEditSlug(undefined); setEditLoadRetry((count) => count + 1) }}>Retry</Button></section>
  }

  return (
    <section className="submit-page">
      <Dialog open={!guidelinesAccepted} onOpenChange={() => {}} labelledBy={guidelinesTitleId} className="submission-guidelines-dialog" dismissible={false}>
        <header className="ui-dialog-header submission-guidelines-header">
          <div>
            <h2 id={guidelinesTitleId}>Submission policy</h2>
          </div>
        </header>
        <div className="ui-dialog-body submission-guidelines-body">
          <ul className="submission-guidelines-list">
            <li><strong>No leaked or private content.</strong> Do not submit leaked, stolen, or unreleased material, including private FLPs, project files, builds, audio, or assets.</li>
            <li><strong>Downloads must be free.</strong> Do not submit paid resources or links that require a purchase, subscription, or payment to access the download.</li>
            <li><strong>Keep it Friday Night Funkin’ related.</strong> Submit resources connected to FNF and choose the type that accurately describes the file.</li>
            <li><strong>Credit people accurately.</strong> Do not claim another person’s work as your own. Identify original creators and recreations honestly when known.</li>
            <li><strong>No spam or deceptive listings.</strong> Avoid duplicate entries, misleading titles or details, broken links, and links that hide what they download.</li>
            <li><strong>Keep the community safe.</strong> No racism, hate speech, harassment, threats, doxxing, impersonation, raids, or coordinated disruption.</li>
            <li><strong>Downloads must be safe.</strong> Do not link to malware, credential theft, or deceptive download pages.</li>
          </ul>
          <label className="submission-guidelines-agreement">
            <Checkbox id="submission-guidelines-accept" name="submissionGuidelinesAccepted" checked={guidelinesChecked} onCheckedChange={(checked) => setGuidelinesChecked(checked === true)} />
            <span>I have read and agree to follow these submission guidelines.</span>
          </label>
        </div>
        <footer className="ui-dialog-footer submission-guidelines-footer">
          <Button type="button" variant="outline" render={<Link to="/" />}>Back to Browse</Button>
          <Button type="button" disabled={!guidelinesChecked} onClick={acceptSubmissionPolicy}>Accept and continue</Button>
        </footer>
      </Dialog>
      <form className="submit-editor" onSubmit={(event) => { void handleSubmit(event) }} noValidate>
        {requestError && <p className="submit-message submit-message-error" role="alert">{requestError}</p>}
        {submittedSlug && <p className="submit-message submit-message-success" role="status"><Check size={16} aria-hidden="true" />{editingResource?.status === "pending" ? "Resource submitted and is awaiting approval." : "Resource submitted."}{editingResource?.status !== "pending" && <> <Link to={`/resources/${encodeURIComponent(submittedSlug)}`}>View resource <ArrowUpRight size={14} aria-hidden="true" /></Link></>}</p>}

        <Tabs value={tab} onValueChange={(value) => setTab(value as SubmissionTab)} className="submit-tabs-root">
          <div className="submit-tabbar">
            <TabsList aria-label="Resource submission sections" className="submit-tabs-list" activateOnFocus>
              <TabsTrigger value="resource"><FileText size={17} aria-hidden="true" />Resource</TabsTrigger>
              <TabsTrigger value="credits"><UserRound size={17} aria-hidden="true" />Credits</TabsTrigger>
              <TabsTrigger value="files"><Link2 size={17} aria-hidden="true" />Files</TabsTrigger>
              <TabsTrigger value="details"><Music2 size={17} aria-hidden="true" />Details</TabsTrigger>
            </TabsList>
            <Button className="submit-tabs-submit" type="submit" disabled={pending || !guidelinesAccepted}>{pending ? (editSlug ? "Saving…" : "Submitting…") : (editSlug ? "Save changes" : "Submit")}</Button>
          </div>

          <TabsContent value="resource" keepMounted className="submit-tab-panel">
            <div className="submit-field-grid">
              <div className="submit-field submit-field-wide">
                <label htmlFor="resource-title">Title <span aria-hidden="true">*</span></label>
                <Input ref={titleRef} id="resource-title" name="title" value={values.title} onChange={(event) => updateValue("title", event.target.value)} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "resource-title-error" : undefined} />
                {errors.title && <span className="submit-field-error" id="resource-title-error">{errors.title}</span>}
              </div>
              <div className="submit-field">
                <label htmlFor="resource-from-mod">From Mod</label>
                <Input id="resource-from-mod" name="fromMod" value={values.fromMod} onChange={(event) => updateValue("fromMod", event.target.value)} />
              </div>
              <div className="submit-field">
                <label htmlFor="resource-version">Version</label>
                <Input id="resource-version" name="version" value={values.version} onChange={(event) => updateValue("version", event.target.value)} />
              </div>
              <div className="submit-field submit-field-wide">
                <label htmlFor="resource-type">Resource type <span aria-hidden="true">*</span></label>
                <Select<string | null> value={values.type || null} onValueChange={(value) => updateValue("type", value ?? "")}>
                  <SelectTrigger ref={typeRef} id="resource-type" className="submit-select-trigger submit-type-trigger" aria-invalid={Boolean(errors.type)} aria-describedby={errors.type ? "resource-type-error" : undefined} aria-required="true">
                    {values.type && <ResourceTypeIcon type={values.type} />}
                    <SelectValue placeholder="Choose a type" />
                  </SelectTrigger>
                  <SelectContent className="submit-type-menu">
                    {knownResourceTypes.map((type) => <SelectItem className="submit-type-option" key={type} value={type}><ResourceTypeIcon type={type} />{type}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.type && <span className="submit-field-error" id="resource-type-error">{errors.type}</span>}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="credits" keepMounted className="submit-tab-panel">
            <div className="submit-field-grid">
              <div className="submit-field"><label htmlFor="resource-original-by">Original By</label><Input id="resource-original-by" name="originalBy" value={values.originalBy} onChange={(event) => updateValue("originalBy", event.target.value)} /></div>
              <div className="submit-field"><label htmlFor="resource-recreation-by">Recreation By</label><Input id="resource-recreation-by" name="recreationBy" value={values.recreationBy} onChange={(event) => updateValue("recreationBy", event.target.value)} /></div>
            </div>
          </TabsContent>

          <TabsContent value="files" keepMounted className="submit-tab-panel">
            <div className="submit-files-layout">
              <div className="submit-field submit-cover-picker">
                <h3>Cover image</h3>
                <ImagePicker
                  id="resource-cover-file"
                  name="coverImage"
                  label="Cover image"
                  accept="image/jpeg,image/png,image/webp"
                  aspectRatio={16 / 9}
                  layout="cover"
                  presentation="cover-editor"
                  imageUrl={coverImage?.url ?? (coverRemoved ? null : editSlug ? editingResource?.coverUrl ?? null : null)}
                  fileName={coverImage?.file.name}
                  error={coverImageError}
                  onSelect={chooseCoverImage}
                  onAdjust={openCoverCrop}
                  onRemove={coverImage || (editSlug && editingResource?.coverUrl && !coverRemoved) ? () => { setCoverImage(null); setCoverRemoved(true); setCoverCrop(defaultCrop); setUploadedCoverUrl("") } : undefined}
                />
              </div>
              <div className="submit-download-fields">
              <div className="submit-field">
                <label htmlFor="resource-download-url">Download URL</label>
                <Input ref={downloadUrlRef} id="resource-download-url" name="downloadUrl" type="url" inputMode="url" value={values.downloadUrl} onChange={(event) => updateValue("downloadUrl", event.target.value)} aria-invalid={Boolean(errors.downloadUrl)} aria-describedby={errors.downloadUrl ? "resource-download-url-error" : undefined} />
                {errors.downloadUrl && <span className="submit-field-error" id="resource-download-url-error">{errors.downloadUrl}</span>}
              </div>
              <div className="submit-field">
                <label htmlFor="resource-alternate-download">Alternative downloads</label>
                <div className="submit-inline-add">
                  <Input id="resource-alternate-download" name="alternateDownloadDraft" type="url" inputMode="url" value={alternateDownloadDraft} onChange={(event) => { setAlternateDownloadDraft(event.target.value); setAlternateDownloadError("") }} onKeyDown={handleAlternateDownloadKeyDown} aria-invalid={Boolean(alternateDownloadError)} aria-describedby={alternateDownloadError ? "resource-alternate-download-error" : "resource-alternate-download-hint"} />
                  <Button type="button" variant="outline" onClick={addAlternateDownload}><Plus size={15} aria-hidden="true" />Add link</Button>
                </div>
                {alternateDownloadError ? <span className="submit-field-error" id="resource-alternate-download-error" role="alert">{alternateDownloadError}</span> : <span className="submit-field-hint" id="resource-alternate-download-hint">Add up to 10 extra download URLs.</span>}
                {values.alternateDownloads.length > 0 && <ul className="submit-alternate-downloads" aria-label="Added alternative downloads">{values.alternateDownloads.map((url, index) => <li key={url}><span><Link2 size={14} aria-hidden="true" />Alternative download {index + 1}</span><button type="button" aria-label={`Remove alternative download ${index + 1}`} onClick={() => updateValue("alternateDownloads", values.alternateDownloads.filter((_, current) => current !== index))}><X size={15} aria-hidden="true" /></button></li>)}</ul>}
              </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="details" keepMounted className="submit-tab-panel">
            <div className="submit-field-grid">
              <div className="submit-field submit-field-wide">
                <label htmlFor="resource-description">Description</label>
                <textarea className="submit-textarea" id="resource-description" name="description" value={values.description} onChange={(event) => updateValue("description", event.target.value)} rows={5} />
              </div>
              <div className="submit-field submit-field-wide">
                <label htmlFor="resource-tags">Tags</label>
                <Input id="resource-tags" name="tagDraft" value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={handleTagKeyDown} aria-describedby="resource-tags-hint" />
                <span className="submit-field-hint" id="resource-tags-hint">Press Enter or comma to add each tag.</span>
                {values.tags.length > 0 && <ul className="submit-tag-list" aria-label="Added tags">{values.tags.map((tag) => <li key={tag}><Tag size={12} aria-hidden="true" /><span>{tag}</span><button type="button" aria-label={`Remove tag ${tag}`} onClick={() => updateValue("tags", values.tags.filter((current) => current !== tag))}><X size={13} aria-hidden="true" /></button></li>)}</ul>}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </form>
      {coverCropOpen && coverImage && <CoverCropDialog open onOpenChange={(open) => { if (open) setCoverCropOpen(true); else closeCoverCrop(false) }} imageUrl={coverImage.url} crop={coverCropDraft} onCropChange={setCoverCropDraft} onApply={() => closeCoverCrop(true)} />}
    </section>
  )
}
