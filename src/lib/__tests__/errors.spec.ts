import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { UserError, userMessage } from '../errors'

const FALLBACK = 'settings.saveFailed'

describe('userMessage', () => {
  it('shows the first validation message', () => {
    const result = z.number('validation.oddInvalid').safeParse('x')
    expect(userMessage(result.error, FALLBACK)).toBe('validation.oddInvalid')
  })

  it('shows messages written for the user', () => {
    expect(userMessage(new UserError('errors.emptyName'), FALLBACK)).toBe('errors.emptyName')
  })

  it('hides database and network errors behind the fallback', () => {
    expect(userMessage(new Error('permission denied for table predictions'), FALLBACK)).toBe(
      FALLBACK,
    )
    expect(userMessage({ code: '23505', message: 'duplicate key value' }, FALLBACK)).toBe(FALLBACK)
    expect(userMessage(new TypeError('Failed to fetch'), FALLBACK)).toBe(FALLBACK)
  })
})
