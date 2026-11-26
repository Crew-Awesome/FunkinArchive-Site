import { useEffect, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  labelledBy: string
  describedBy?: string
  className?: string
  dismissible?: boolean
  children: ReactNode
}

export function Dialog({ open, onOpenChange, labelledBy, describedBy, className = "", dismissible = true, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.setAttribute("closedby", dismissible ? "any" : "none")
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [dismissible, open])

  return createPortal(
    <dialog
      ref={dialogRef}
      className={`ui-dialog ${className}`}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(event) => { if (!dismissible) event.preventDefault() }}
      onClose={() => { if (dismissible) onOpenChange(false) }}
    >
      {children}
    </dialog>,
    document.body,
  )
}
