import { Badge } from "@/components/ui/badge"
import { ResourceTypeIcon } from "@/components/resource-type-icon"

export function ResourceTypePills({ types, className = "" }: { types: string[]; className?: string }) {
  const uniqueTypes = [...new Set(types.map((type) => type.trim()).filter(Boolean))]
  if (!uniqueTypes.length) return null

  return (
    <div className={`resource-type-pills ${className}`} aria-label="Resource types">
      {uniqueTypes.map((type) => {
        return <Badge key={type} variant="secondary" className="resource-type-pill"><ResourceTypeIcon type={type} />{type}</Badge>
      })}
    </div>
  )
}
