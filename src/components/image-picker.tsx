import { useRef, useState } from "react"
import { Crop, Image as ImageIcon, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

type ImagePickerLayout = "cover" | "avatar" | "banner"

interface ImagePickerProps {
  id: string
  name: string
  label: string
  accept: string
  aspectRatio: number
  layout: ImagePickerLayout
  presentation?: "inline" | "profile" | "cover-editor"
  imageUrl: string | null
  fileName?: string
  error?: string
  adjustLabel?: string
  removeLabel?: string
  removeDisabled?: boolean
  onSelect: (file: File | null) => void
  onAdjust?: () => void
  onRemove?: () => void
}

export function ImagePicker({
  id,
  name,
  label,
  accept,
  aspectRatio,
  layout,
  presentation = "inline",
  imageUrl,
  fileName,
  error,
  adjustLabel = "Adjust crop",
  removeLabel = "Remove",
  removeDisabled,
  onSelect,
  onAdjust,
  onRemove,
}: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)
  const descriptionId = `${id}-description`

  return (
    <div className="image-picker" data-layout={layout} data-presentation={presentation} role="group" aria-labelledby={`${id}-label`} aria-describedby={error ? descriptionId : undefined}>
      <button
        type="button"
        className="image-picker-preview"
        data-has-image={Boolean(imageUrl && failedImageUrl !== imageUrl)}
        style={{ aspectRatio: String(aspectRatio) }}
        aria-label={`${imageUrl ? "Change" : "Upload"} ${label.toLowerCase()}`}
        aria-controls={id}
        title={`${imageUrl ? "Change" : "Upload"} ${label.toLowerCase()}`}
        onClick={() => inputRef.current?.click()}
      >
        {imageUrl && failedImageUrl !== imageUrl
          ? <><img src={imageUrl} alt="" onError={() => setFailedImageUrl(imageUrl)} /><span className="image-picker-change-indicator"><ImageIcon size={17} aria-hidden="true" /></span></>
          : <span className="image-picker-placeholder"><Plus size={17} aria-hidden="true" /><span>Upload</span></span>}
      </button>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept={accept}
        className="image-picker-native-input"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          onSelect(event.currentTarget.files?.[0] ?? null)
          event.currentTarget.value = ""
        }}
      />
      <div className="image-picker-controls">
        <span className="image-picker-label" id={`${id}-label`}>{label}</span>
        {(fileName && onAdjust || onRemove) && <div className="image-picker-actions">
          {fileName && onAdjust && <Button type="button" variant={presentation === "inline" ? "outline" : "ghost"} size={presentation === "inline" ? undefined : "icon"} className={presentation === "inline" ? undefined : "image-picker-icon-action"} aria-label={presentation === "inline" ? undefined : adjustLabel} onClick={onAdjust}>{presentation === "inline" ? adjustLabel : <Crop size={15} aria-hidden="true" />}</Button>}
          {onRemove && <Button type="button" variant="ghost" size={presentation === "inline" ? undefined : "icon"} className={presentation === "inline" ? undefined : "image-picker-icon-action"} aria-label={presentation === "inline" ? undefined : removeLabel} disabled={removeDisabled} onClick={onRemove}>{presentation === "inline" ? removeLabel : <Trash2 size={15} aria-hidden="true" />}</Button>}
        </div>}
        {error && <span className="image-picker-error" id={descriptionId} role="alert">{error}</span>}
      </div>
    </div>
  )
}
