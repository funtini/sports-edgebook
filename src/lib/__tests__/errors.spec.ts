import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { UserError, userMessage } from '../errors'

const FALLBACK = 'Não foi possível guardar.'

describe('userMessage', () => {
  it('shows the first validation message', () => {
    const result = z.number('Odd inválida').safeParse('x')
    expect(userMessage(result.error, FALLBACK)).toBe('Odd inválida')
  })

  it('shows messages written for the user', () => {
    expect(userMessage(new UserError('O nome não pode estar vazio.'), FALLBACK)).toBe(
      'O nome não pode estar vazio.',
    )
  })

  it('hides database and network errors behind the fallback', () => {
    expect(userMessage(new Error('permission denied for table predictions'), FALLBACK)).toBe(
      FALLBACK,
    )
    expect(userMessage({ code: '23505', message: 'duplicate key value' }, FALLBACK)).toBe(FALLBACK)
    expect(userMessage(new TypeError('Failed to fetch'), FALLBACK)).toBe(FALLBACK)
  })
})
