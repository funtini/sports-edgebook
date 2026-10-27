import { describe, expect, it } from 'vitest'
import { useLatestRequest } from '../useLatestRequest'

describe('useLatestRequest', () => {
  it('only the latest started request is current', () => {
    const requests = useLatestRequest()
    const first = requests.start()
    expect(first()).toBe(true)

    const second = requests.start()
    expect(first()).toBe(false)
    expect(second()).toBe(true)
  })
})
