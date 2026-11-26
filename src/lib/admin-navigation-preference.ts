export const adminNavigationPreferenceEvent = "funkin-archive:admin-navigation-preference"

export function adminNavigationPreferenceKey(userId: string) {
  return `hide-admin-pages:${userId}`
}

export function readAdminNavigationPreference(userId: string) {
  try {
    return window.localStorage.getItem(adminNavigationPreferenceKey(userId)) === "true"
  } catch {
    return false
  }
}

export function writeAdminNavigationPreference(userId: string, hidden: boolean) {
  try {
    const key = adminNavigationPreferenceKey(userId)
    if (hidden) window.localStorage.setItem(key, "true")
    else window.localStorage.removeItem(key)
  } catch {
    // Keep the current page usable when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(adminNavigationPreferenceEvent, { detail: { userId, hidden } }))
}
