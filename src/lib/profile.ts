export function profileInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0] ?? "").join("").toLocaleUpperCase()
}
