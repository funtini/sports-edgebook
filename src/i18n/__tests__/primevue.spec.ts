import { describe, expect, it } from 'vitest'
import { primeVueLocale } from '../primevue'

const t = (key: string) => key

describe('primeVueLocale', () => {
  it('builds PT-PT day and month names starting the week on Sunday', () => {
    const locale = primeVueLocale('pt-PT', t)
    expect(locale.dayNames?.[0]).toBe('domingo')
    expect(locale.dayNames?.[1]).toBe('segunda-feira')
    expect(locale.monthNames?.[11]).toBe('dezembro')
    expect(locale.firstDayOfWeek).toBe(1)
  })

  it('builds English names', () => {
    const locale = primeVueLocale('en-GB', t)
    expect(locale.dayNames?.[0]).toBe('Sunday')
    expect(locale.monthNamesShort?.[0]).toBe('Jan')
  })

  it('takes button labels from the messages', () => {
    expect(primeVueLocale('pt-PT', t).today).toBe('primevue.today')
  })
})
