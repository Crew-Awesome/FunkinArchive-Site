import type { CSSProperties } from "react"

const resourceTypeIconPaths: Record<string, string> = {
  Chroms: "/icons/resource-types/chroms.svg",
  DWPs: "/icons/resource-types/dwps.svg",
  FLAs: "/icons/resource-types/flas.svg",
  FLMs: "/icons/resource-types/flms.svg",
  FLPs: "/icons/resource-types/flps.svg",
  MIDIs: "/icons/resource-types/midis.svg",
  SF2s: "/icons/resource-types/sf2s.svg",
  Other: "/icons/resource-types/other.svg",
}

export function ResourceTypeIcon({ type }: { type: string }) {
  const icon = resourceTypeIconPaths[type] ?? resourceTypeIconPaths.Other
  const style = { maskImage: `url("${icon}")`, WebkitMaskImage: `url("${icon}")` } as CSSProperties

  return <span className="resource-type-icon" style={style} aria-hidden="true" />
}
