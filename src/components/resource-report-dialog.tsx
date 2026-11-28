import { useState, type FormEvent } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog } from "@/components/ui/dialog"
import type { ResourceListing } from "@/data/resources"

const reasons = [
  ["leaked_private_content", "Leaked or private content"], ["paid_download", "Paid download"],
  ["unrelated_resource", "Not Friday Night Funkin’ related"], ["credit_problem", "Incorrect or missing credit"],
  ["spam_duplicate_misleading", "Spam, duplicate, or misleading listing"], ["community_safety", "Harassment or unsafe community content"],
  ["unsafe_download", "Unsafe download"], ["broken_cover", "Broken or incorrect cover image"],
  ["broken_download", "Broken download link"], ["incorrect_details", "Incorrect resource details"], ["other", "Other"],
] as const

export function ResourceReportDialog({ resource, open, onOpenChange }: { resource: ResourceListing; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [reason, setReason] = useState("")
  const [target, setTarget] = useState("download")
  const [details, setDetails] = useState("")
  const [suggestedUrl, setSuggestedUrl] = useState("")
  const [image, setImage] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const id = `report-${resource.id}`
  const needsDownloadTarget = reason === "broken_download" && resource.alternateDownloads.length > 0

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true); setError("")
    const data = new FormData()
    data.set("reasonCode", reason); data.set("details", details)
    if (reason === "broken_download") {
      const [field, index] = target.split(":")
      data.set("targetField", field)
      if (index != null) data.set("targetIndex", index)
    }
    if (suggestedUrl.trim()) data.set("suggestedUrl", suggestedUrl.trim())
    if (image) data.set("replacementImage", image)
    try {
      const response = await fetch(`/api/resources/${encodeURIComponent(resource.slug)}/report`, { method: "POST", credentials: "same-origin", body: data })
      const result = await response.json().catch(() => null) as { message?: string } | null
      if (!response.ok) throw new Error(result?.message ?? "The report could not be sent.")
      setSuccess(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The report could not be sent.") }
    finally { setPending(false) }
  }

  function close(next: boolean) {
    if (!next) {
      setReason(""); setTarget("download"); setDetails(""); setSuggestedUrl(""); setImage(null); setError(""); setSuccess(false)
    }
    onOpenChange(next)
  }

  return <Dialog open={open} onOpenChange={close} labelledBy={`${id}-heading`} className="resource-report-dialog">
    <header className="ui-dialog-header"><div><h2 id={`${id}-heading`}>{success ? "Report sent" : "Report this resource"}</h2></div><Button type="button" variant="ghost" size="icon" className="ui-dialog-close" aria-label="Close report form" onClick={() => close(false)}><X size={18} /></Button></header>
    {success ? <div className="ui-dialog-body report-success"><p>Thanks. The report is private and will be reviewed by the site team.</p><Button onClick={() => close(false)}>Done</Button></div> : <form onSubmit={(event) => { void submit(event) }}>
      <div className="ui-dialog-body report-form">
        <label className="report-field" htmlFor={`${id}-reason`}><span>What’s the issue?</span><select id={`${id}-reason`} required value={reason} onChange={(event) => setReason(event.target.value)}><option value="" disabled>Select a reason</option>{reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {needsDownloadTarget && <label className="report-field" htmlFor={`${id}-target`}><span>Which link is broken?</span><select id={`${id}-target`} value={target} onChange={(event) => setTarget(event.target.value)}><option value="download">Main download</option>{resource.alternateDownloads.map((_, index) => <option key={index} value={`alternate_download:${index}`}>Alternative download {index + 1}</option>)}</select></label>}
        <label className="report-field" htmlFor={`${id}-details`}><span>Tell us what happened</span><textarea id={`${id}-details`} required minLength={10} maxLength={1500} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Include enough detail for us to check the issue." rows={4} /></label>
        {reason === "broken_cover" && <><label className="report-field" htmlFor={`${id}-suggested-url`}><span>Suggested image URL <small>Optional</small></span><Input id={`${id}-suggested-url`} type="url" value={suggestedUrl} onChange={(event) => { setSuggestedUrl(event.target.value); if (event.target.value) setImage(null) }} placeholder="https://…" /></label><label className="report-field" htmlFor={`${id}-image`}><span>Or attach a replacement image <small>JPG, PNG, or WebP · up to 5 MB</small></span><input id={`${id}-image`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const selected = event.target.files?.[0] ?? null; setImage(selected); if (selected) setSuggestedUrl("") }} /></label></>}
        {reason === "broken_download" && <label className="report-field" htmlFor={`${id}-suggested-download`}><span>Suggested working link <small>Optional</small></span><Input id={`${id}-suggested-download`} type="url" value={suggestedUrl} onChange={(event) => setSuggestedUrl(event.target.value)} placeholder="https://…" /></label>}
        {error && <p className="report-error" role="alert">{error}</p>}
      </div>
      <footer className="ui-dialog-footer"><Button type="button" variant="outline" onClick={() => close(false)} disabled={pending}>Cancel</Button><Button type="submit" disabled={pending || !reason}>{pending ? "Sending…" : "Send report"}</Button></footer>
    </form>}
  </Dialog>
}
