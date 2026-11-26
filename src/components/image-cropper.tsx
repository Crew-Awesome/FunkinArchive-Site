import Cropper, { type Area, type Point } from "react-easy-crop"
import "react-easy-crop/react-easy-crop.css"
import { useRef, type Dispatch, type KeyboardEvent, type PointerEvent, type SetStateAction } from "react"

export interface ImageCropSettings {
  crop: Point
  zoom: number
  croppedAreaPixels: Area | null
}

interface ImageCropperProps {
  imageUrl: string
  label: string
  aspectRatio: number
  crop: ImageCropSettings
  onCropChange: Dispatch<SetStateAction<ImageCropSettings>>
  hintId?: string
}

const MIN_ZOOM = 1
const MAX_ZOOM = 3
const KEYBOARD_ZOOM_STEP = 0.05

export function ImageCropper({ imageUrl, label, aspectRatio, crop, onCropChange, hintId }: ImageCropperProps) {
  const dragState = useRef<{ pointerId: number; startZoom: number; startRadius: number; centerX: number; centerY: number } | null>(null)

  function changeZoomBy(delta: number) {
    onCropChange((current) => ({ ...current, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom + delta)) }))
  }

  function startHandleDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!rect) return
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const startRadius = Math.hypot(event.clientX - centerX, event.clientY - centerY)
    dragState.current = { pointerId: event.pointerId, startZoom: crop.zoom, startRadius, centerX, centerY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveHandleDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragState.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    const radius = Math.hypot(event.clientX - drag.centerX, event.clientY - drag.centerY)
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, drag.startZoom * radius / drag.startRadius))
    onCropChange((current) => current.zoom === zoom ? current : { ...current, zoom })
  }

  function endHandleDrag(event: PointerEvent<HTMLButtonElement>) {
    if (dragState.current?.pointerId !== event.pointerId) return
    dragState.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (["ArrowUp", "ArrowRight", "+", "="].includes(event.key)) {
      event.preventDefault()
      changeZoomBy(KEYBOARD_ZOOM_STEP)
    } else if (["ArrowDown", "ArrowLeft", "-", "_"].includes(event.key)) {
      event.preventDefault()
      changeZoomBy(-KEYBOARD_ZOOM_STEP)
    }
  }

  return (
    <div className="image-cropper" role="group" aria-label={`${label} crop settings`}>
      <div className="image-crop-frame" style={{ aspectRatio: String(aspectRatio) }}>
        <Cropper
          image={imageUrl}
          crop={crop.crop}
          zoom={crop.zoom}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          aspect={aspectRatio}
          objectFit="cover"
          cropShape={aspectRatio === 1 ? "round" : "rect"}
          keyboardStep={10}
          zoomWithScroll={false}
          onCropChange={(position) => onCropChange((current) => ({ ...current, crop: position }))}
          onZoomChange={(nextZoom) => onCropChange((current) => ({ ...current, zoom: nextZoom }))}
          onCropComplete={(_, croppedAreaPixels) => onCropChange((current) => ({ ...current, croppedAreaPixels }))}
          cropperProps={{ role: "group", tabIndex: 0, "aria-label": `Pan ${label.toLowerCase()} crop area with arrow keys` }}
          disableAutomaticStylesInjection
        />
        {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((corner) => (
          <button
            key={corner}
            type="button"
            className={`image-crop-handle image-crop-handle-${corner}`}
            aria-label={`${corner.replace("-", " ")} zoom handle for ${label}. Drag outward to zoom in or inward to zoom out. Use arrow keys or plus and minus.`}
            title="Drag outward to zoom in, inward to zoom out"
            onPointerDown={startHandleDrag}
            onPointerMove={moveHandleDrag}
            onPointerUp={endHandleDrag}
            onPointerCancel={endHandleDrag}
            onLostPointerCapture={() => { dragState.current = null }}
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onKeyDown={handleKeyDown}
          />
        ))}
      </div>
      <div className="image-crop-readout">
        <p id={hintId} className="image-crop-hint">Drag a corner dot outward to zoom in or inward to zoom out.</p>
        <output className="image-crop-zoom" aria-label="Zoom level">Zoom {crop.zoom.toFixed(2)}×</output>
      </div>
    </div>
  )
}
