import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useMediaQuery } from '../useMediaQuery'

describe('useMediaQuery', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is false without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined)
    const scope = effectScope()
    expect(scope.run(() => useMediaQuery('(min-width: 1024px)'))?.value).toBe(false)
    scope.stop()
  })

  it('follows the query live and stops listening with its scope', () => {
    let listener: ((event: { matches: boolean }) => void) | null = null
    const removeEventListener = vi.fn<(type: string, listener: unknown) => void>()
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: (_: string, l: (event: { matches: boolean }) => void) => (listener = l),
      removeEventListener,
    }))
    const scope = effectScope()
    const matches = scope.run(() => useMediaQuery('(min-width: 1024px)'))!
    expect(matches.value).toBe(true)
    listener!({ matches: false })
    expect(matches.value).toBe(false)
    scope.stop()
    expect(removeEventListener).toHaveBeenCalledWith('change', listener)
  })
})
