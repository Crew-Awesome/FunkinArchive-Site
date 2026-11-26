import { useEffect, useState } from "react"
import { Popover } from "@base-ui/react/popover"
import { Star } from "lucide-react"
import { Button } from "@/components/ui/button"

function ratingLabel(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function StarRatingFilter({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value ?? 3)

  useEffect(() => {
    if (open) setDraft(value ?? 3)
  }, [open, value])

  function apply(nextValue: number | null) {
    onChange(nextValue)
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger render={<Button type="button" variant="outline" className="star-rating-trigger" aria-label={value == null ? "Filter by star rating: all ratings" : `Filter by star rating: ${ratingLabel(value)} or more`} />}>
        <Star className={value == null ? "star-rating-trigger-icon" : "star-rating-trigger-icon is-active"} size={15} aria-hidden="true" />
        <span>{value == null ? "All ratings" : `${ratingLabel(value)}+ stars`}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} className="star-rating-positioner">
          <Popover.Popup className="star-rating-popover" aria-label="Filter resources by star rating">
            <div className="star-rating-popover-heading">
              <span className="star-rating-current"><Star size={15} fill="currentColor" aria-hidden="true" />{ratingLabel(draft)}+ stars</span>
            </div>
            <input
              className="star-rating-slider"
              type="range"
              min="0"
              max="5"
              step="0.5"
              value={draft}
              aria-label="Minimum star rating"
              aria-valuetext={`${ratingLabel(draft)} stars and up`}
              onChange={(event) => setDraft(Number(event.currentTarget.value))}
            />
            <div className="star-rating-slider-ticks" aria-hidden="true"><span>0</span><span>1.5</span><span>3</span><span>5</span></div>
            <div className="star-rating-popover-actions">
              <Button type="button" variant="ghost" size="sm" onClick={() => apply(null)}>Reset</Button>
              <Button type="button" size="sm" onClick={() => apply(draft)}>Apply</Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
