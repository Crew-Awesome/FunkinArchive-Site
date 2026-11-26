import { Search, SlidersHorizontal, X } from "lucide-react"
import { StarRatingFilter } from "@/components/star-rating-filter"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

const sortOptions = [
  ["newest", "Newest"],
  ["oldest", "Oldest"],
  ["updated", "Recently updated"],
  ["least-updated", "Least recently updated"],
  ["alphabetical", "Title A–Z"],
  ["reverse-alphabetical", "Title Z–A"],
  ["highest-rated", "Highest rated"],
  ["most-rated", "Most rated"],
] as const

function ProfileSelect({ label, value, items, onChange }: {
  label: string
  value: string
  items: Array<[string, string]>
  onChange: (value: string) => void
}) {
  return (
    <label className="filter-field">
      <span className="sr-only">{label}</span>
      <Select value={value} onValueChange={(next) => { if (next) onChange(next) }}>
        <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>{items.map(([itemValue, itemLabel]) => <SelectItem key={itemValue} value={itemValue}>{itemLabel}</SelectItem>)}</SelectContent>
      </Select>
    </label>
  )
}

export function ProfileResourceControls({
  query,
  type,
  minRating,
  sort,
  types,
  onQueryChange,
  onChange,
  onReset,
}: {
  query: string
  type: string
  minRating: string
  sort: string
  types: string[]
  onQueryChange: (value: string) => void
  onChange: (key: "type" | "minRating" | "sort", value: string) => void
  onReset: () => void
}) {
  const filters = [
    ["all", "All types"],
    ...types.map((item) => [item, item] as [string, string]),
  ] as Array<[string, string]>
  const filterCount = Number(type !== "all") + Number(minRating !== "all")

  return (
    <div className="browse-toolbar profile-resource-toolbar">
      <search className="browse-search-area">
        <label className="sr-only" htmlFor="profile-resource-search">Search this profile’s resources</label>
        <Search className="search-icon" size={18} aria-hidden="true" />
        <Input id="profile-resource-search" className="browse-search-input" type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search this profile’s resources" autoComplete="off" />
        {query && <Button className="search-clear" variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => onQueryChange("")}><X size={16} /></Button>}
      </search>

      <section className="browse-controls" aria-label="Profile resource controls">
        <div className="profile-desktop-filters">
          <ProfileSelect label="Type" value={type} items={filters} onChange={(value) => onChange("type", value)} />
          <StarRatingFilter value={minRating === "all" ? null : Number(minRating)} onChange={(value) => onChange("minRating", value == null ? "all" : String(value))} />
        </div>
        <div className="browse-control-actions">
          <Sheet>
            <SheetTrigger className="profile-filter-trigger" render={<Button variant="outline" size="sm" />}>
              <SlidersHorizontal size={15} /> Filters{filterCount > 0 && <span className="filter-count">{filterCount}</span>}
            </SheetTrigger>
            <SheetContent side="right" className="mobile-filter-sheet">
              <SheetHeader><SheetTitle>Filters</SheetTitle><SheetDescription>Filter this profile’s resources by type and rating.</SheetDescription></SheetHeader>
              <div className="mobile-filter-fields">
                <ProfileSelect label="Type" value={type} items={filters} onChange={(value) => onChange("type", value)} />
                <StarRatingFilter value={minRating === "all" ? null : Number(minRating)} onChange={(value) => onChange("minRating", value == null ? "all" : String(value))} />
              </div>
              <div className="mobile-filter-footer"><Button variant="outline" onClick={onReset}>Reset filters</Button></div>
            </SheetContent>
          </Sheet>
          <div className="sort-field">
            <span className="sr-only">Sort resources</span>
            <Select value={sort} onValueChange={(value) => { if (value) onChange("sort", value) }}>
              <SelectTrigger aria-label="Sort resources"><SelectValue /></SelectTrigger>
              <SelectContent className="sort-menu">{sortOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </section>
    </div>
  )
}
