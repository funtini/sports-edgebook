/** A name typed by hand, trimmed and with inner whitespace collapsed: how it is stored. */
export function tidyName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

/** Same name ignoring case and extra spaces, the way leagues, teams and markets are matched. */
export function sameName(a: string, b: string): boolean {
  return tidyName(a).toLowerCase() === tidyName(b).toLowerCase()
}

/** Up to `limit` distinct names (ignoring case and extra spaces) containing `query`, in order. */
export function suggestNames(names: readonly string[], query: string, limit = 10): string[] {
  const q = tidyName(query).toLowerCase()
  const seen = new Set<string>()
  const result: string[] = []
  for (const name of names) {
    const key = tidyName(name).toLowerCase()
    if (seen.has(key) || !key.includes(q)) continue
    seen.add(key)
    result.push(name)
    if (result.length === limit) break
  }
  return result
}
