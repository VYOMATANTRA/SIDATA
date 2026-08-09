export async function getCsrfToken(): Promise<string> {
  try {
    const res = await fetch('/api/auth/csrf-token')
    if (!res.ok) return ''
    const data = await res.json()
    return data.csrfToken || ''
  } catch {
    return ''
  }
}
