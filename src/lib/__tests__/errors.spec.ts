import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { AppError, errorMessage } from '../errors'

describe('errorMessage', () => {
  it('shows the first validation issue', () => {
    const result = z.number().min(1, 'Tem de ser pelo menos 1').safeParse(0)
    expect(errorMessage(result.error, 'Falhou')).toBe('Tem de ser pelo menos 1')
  })

  it('shows messages written for the user', () => {
    expect(errorMessage(new AppError('O nome não pode estar vazio.'), 'Falhou')).toBe(
      'O nome não pode estar vazio.',
    )
  })

  it('replaces anything else with the fallback and logs it', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const raw = new Error('permission denied for table predictions')
    expect(errorMessage(raw, 'Falhou')).toBe('Falhou')
    expect(errorMessage({ code: '42501' }, 'Falhou')).toBe('Falhou')
    expect(log).toHaveBeenCalledWith(raw)
    log.mockRestore()
  })
})
