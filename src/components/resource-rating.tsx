import { useId, useState } from "react"
import { Star } from "lucide-react"

function StarShape({ fill = 0 }: { fill?: number }) {
  return (
    <span className="rating-star-shape" aria-hidden="true">
      <Star className="rating-star-outline" />
      <span className="rating-star-fill" style={{ width: `${fill}%` }}><Star /></span>
    </span>
  )
}

export function StarMeter({ value }: { value: number }) {
  return (
    <span className="rating-star-meter" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => {
        const fill = Math.max(0, Math.min(100, (value - index) * 100))
        return <StarShape key={index} fill={fill} />
      })}
    </span>
  )
}

export function StarRatingInput({ value, disabled = false, onChange }: {
  value: number | null
  disabled?: boolean
  onChange: (value: number) => void
}) {
  const name = useId()
  const [hoverValue, setHoverValue] = useState<number | null>(null)
  const displayValue = hoverValue ?? value ?? 0

  return (
    <fieldset className="rating-input" disabled={disabled} onPointerLeave={() => setHoverValue(null)}>
      <legend className="sr-only">Your rating, from half a star to five stars</legend>
      <span className="rating-star-meter">
        {Array.from({ length: 5 }, (_, index) => {
          const star = index + 1
          const fill = Math.max(0, Math.min(100, (displayValue - index) * 100))
          const choices = [star - 0.5, star]
          return (
            <span className="rating-star-choice-group" key={star}>
              <StarShape fill={fill} />
              {choices.map((rating, choiceIndex) => {
                const id = `${name}-${String(rating).replace(".", "-")}`
                return (
                  <span className={`rating-choice ${choiceIndex === 0 ? "rating-choice-half" : "rating-choice-full"}`} key={rating}>
                    <input
                      className="sr-only"
                      id={id}
                      type="radio"
                      name={name}
                      value={rating}
                      checked={value === rating}
                      onFocus={() => setHoverValue(rating)}
                      onBlur={() => setHoverValue(null)}
                      onChange={() => onChange(rating)}
                    />
                    <label htmlFor={id} onPointerEnter={() => setHoverValue(rating)}>
                      <span className="sr-only">{rating} out of 5 stars</span>
                    </label>
                  </span>
                )
              })}
            </span>
          )
        })}
      </span>
    </fieldset>
  )
}
