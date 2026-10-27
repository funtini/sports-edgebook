/**
 * Guards overlapping async requests (a reload, a new search) so only the latest one applies its
 * result: a slow earlier response must not overwrite a newer one.
 */
export function useLatestRequest() {
  let latest = 0

  /** Starts a request; the returned function tells whether it is still the latest. */
  function start(): () => boolean {
    const request = ++latest
    return () => request === latest
  }

  return { start }
}
