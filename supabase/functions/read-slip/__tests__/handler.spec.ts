import { describe, expect, it, vi } from 'vitest'
import { DAILY_SLIP_READ_LIMIT, MAX_SLIP_IMAGE_BYTES } from '../../../../src/domain/slipRead.ts'
import {
  dayIn,
  handleReadSlip,
  knownTimeZone,
  startOfUtcDay,
  type ReadSlipDeps,
} from '../handler.ts'
import SINGLE from '../../../../src/domain/__tests__/fixtures/slip-single.txt?raw'

const NOW = new Date('2026-10-31T23:30:00Z')
const IMAGE = btoa('not really a jpeg')

function deps(overrides: Partial<ReadSlipDeps> = {}): ReadSlipDeps {
  return {
    countReadsSince: vi.fn<ReadSlipDeps['countReadsSince']>(async () => 0),
    recordRead: vi.fn<ReadSlipDeps['recordRead']>(async () => {}),
    readImage: vi.fn<ReadSlipDeps['readImage']>(async () => SINGLE),
    now: () => NOW,
    ...overrides,
  }
}

function post(body: unknown): Request {
  return new Request('http://localhost/read-slip', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const valid = { image: IMAGE, mediaType: 'image/jpeg', timeZone: 'Europe/Lisbon' }

describe('handleReadSlip', () => {
  it('answers with the validated read and counts it before calling the model', async () => {
    const d = deps()
    const res = await handleReadSlip(post(valid), d)
    expect(res.status).toBe(200)
    expect((await res.json()).legs[0].selection).toBe('yes')
    expect(d.countReadsSince).toHaveBeenCalledWith(new Date('2026-10-31T00:00:00Z'))
    expect(d.recordRead).toHaveBeenCalledOnce()
    expect(d.readImage).toHaveBeenCalledWith({
      image: IMAGE,
      mediaType: 'image/jpeg',
      today: '2026-10-31',
      timeZone: 'Europe/Lisbon',
    })
  })

  it('rejects a body that is not a JPEG read request', async () => {
    for (const body of ['{', {}, { image: IMAGE, mediaType: 'image/png' }, { image: '' }]) {
      const d = deps()
      const res = await handleReadSlip(post(body), d)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid_request' })
      expect(d.readImage).not.toHaveBeenCalled()
    }
  })

  it('rejects anything but POST', async () => {
    const res = await handleReadSlip(new Request('http://localhost/read-slip'), deps())
    expect(res.status).toBe(405)
  })

  it('rejects an image over 5 MB without counting it', async () => {
    const d = deps()
    const image = 'A'.repeat(Math.ceil(((MAX_SLIP_IMAGE_BYTES + 3) * 4) / 3))
    const res = await handleReadSlip(post({ ...valid, image }), d)
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'image_too_large' })
    expect(d.recordRead).not.toHaveBeenCalled()
  })

  it('stops at the daily limit without calling the model', async () => {
    const d = deps({ countReadsSince: async () => DAILY_SLIP_READ_LIMIT })
    const res = await handleReadSlip(post(valid), d)
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'daily_limit' })
    expect(d.recordRead).not.toHaveBeenCalled()
    expect(d.readImage).not.toHaveBeenCalled()
  })

  it('treats output that fails validation as a failed read', async () => {
    for (const text of [null, 'Sorry, I cannot read this slip.', '{"kind":"single","legs":[]}']) {
      const res = await handleReadSlip(post(valid), deps({ readImage: async () => text }))
      expect(res.status).toBe(502)
      expect(await res.json()).toEqual({ error: 'read_failed' })
    }
  })

  it('reports the service as unavailable when the API or the database fails', async () => {
    const apiDown = deps({ readImage: () => Promise.reject(new Error('529')) })
    expect((await handleReadSlip(post(valid), apiDown)).status).toBe(503)
    const dbDown = deps({ recordRead: () => Promise.reject(new Error('rls')) })
    const res = await handleReadSlip(post(valid), dbDown)
    expect(await res.json()).toEqual({ error: 'unavailable' })
  })

  it('never logs the image or the read', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await handleReadSlip(post(valid), deps({ readImage: async () => 'garbage' }))
    expect(log.mock.calls.flat().join(' ')).toBe('read-slip: read_failed')
    log.mockRestore()
  })
})

describe('dates', () => {
  it('starts the daily limit at midnight UTC', () => {
    expect(startOfUtcDay(NOW).toISOString()).toBe('2026-10-31T00:00:00.000Z')
  })

  it('gives today in the owner time zone, falling back to UTC', () => {
    expect(dayIn(NOW, 'Asia/Tokyo')).toBe('2026-11-01')
    expect(knownTimeZone('Not/AZone')).toBe('UTC')
    expect(knownTimeZone(undefined)).toBe('UTC')
  })
})
