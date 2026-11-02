import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { flushPromises, mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { fakeSupabase } from '@/stores/__tests__/fakeSupabase'
import type { SlipRead } from '@/domain/slipRead'
import SlipImportView from '../SlipImportView.vue'

type Invoke = (name: string, options: unknown) => Promise<{ data: unknown; error: unknown }>

const mocked = vi.hoisted(() => ({ client: null as unknown, push: vi.fn<(to: unknown) => void>() }))
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocked.client
  },
}))
vi.mock('vue-router', async (original) => ({
  ...(await original<typeof import('vue-router')>()),
  useRouter: () => ({ push: mocked.push }),
}))
// jsdom has no canvas: the shrinking is the browser's job.
vi.mock('@/lib/slipImage', () => ({
  SLIP_IMAGE_TYPES: ['image/png', 'image/jpeg', 'image/webp'],
  prepareSlipImage: vi.fn<() => Promise<{ base64: string; url: string }>>(async () => ({
    base64: 'AAAA',
    url: 'blob:slip',
  })),
}))

const settingsRow = {
  user_id: 'u',
  unit_value: 10,
  currency: 'EUR',
  starting_bankroll_units: null,
  confidence_anchors: { '1': 0.4, '2': 0.55, '3': 0.65, '4': 0.75, '5': 0.85 },
  odds_bands: [1.5, 1.8, 2.2, 3, 5],
}

const read: SlipRead = {
  kind: 'single',
  bookmaker: 'Betano',
  stake: 10,
  totalOdd: 1.9,
  status: 'pending',
  legs: [
    {
      rawText: 'Benfica - Porto · Mais de 2,5',
      homeTeam: 'Benfica',
      awayTeam: 'Porto',
      league: null,
      kickoffAt: '2026-11-02T20:00:00Z',
      timing: 'pre',
      market: 'goals',
      betType: 'total',
      period: 'FT',
      selection: 'over',
      line: 2.5,
      odd: 1.9,
      status: null,
      unsure: [],
    },
  ],
}

function setup(invoke: Mock<Invoke>) {
  const fake = fakeSupabase((q) =>
    q.table === 'user_settings' ? { data: settingsRow } : { data: [] },
  )
  Object.assign(fake.client, { functions: { invoke } })
  mocked.client = fake.client
}

const mounted: VueWrapper[] = []
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

function render() {
  const wrapper = mount(SlipImportView, {
    global: {
      plugins: [PrimeVue, ToastService],
      stubs: { RouterLink: RouterLinkStub },
    },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  return wrapper
}

async function choose(wrapper: VueWrapper, type = 'image/png') {
  const input = wrapper.find('[data-gallery-input]')
  const file = new File(['x'], 'slip.png', { type })
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('SlipImportView', () => {
  it('starts on Enviar and says the image is not stored', () => {
    setup(vi.fn<Invoke>())
    const wrapper = render()
    expect(wrapper.find('[data-drop-zone]').text()).toContain('Escolhe uma imagem do boletim')
    expect(wrapper.text()).toContain('A imagem não é guardada.')
  })

  it('rejects a file that is not PNG, JPEG or WebP', async () => {
    const invoke = vi.fn<Invoke>()
    setup(invoke)
    const wrapper = render()
    await choose(wrapper, 'image/gif')
    await flushPromises()
    expect(wrapper.text()).toContain('Escolhe uma imagem PNG, JPEG ou WebP.')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('shows the read’s error with "Tentar outra vez", and opens the window when it works', async () => {
    const context = { json: () => Promise.resolve({ error: 'read_failed' }) }
    const invoke = vi
      .fn<Invoke>()
      .mockResolvedValueOnce({ data: null, error: { context } })
      .mockResolvedValueOnce({ data: read, error: null })
    setup(invoke)
    const wrapper = render()

    await choose(wrapper)
    expect(wrapper.find('[data-stage="reading"]').text()).toContain('A ler o boletim…')
    await flushPromises()
    expect(wrapper.find('[data-stage="failed"]').text()).toContain(
      'Não foi possível ler o boletim desta imagem.',
    )
    expect(wrapper.find('[data-other-image]').exists()).toBe(true)

    await wrapper.find('[data-retry]').trigger('click')
    await flushPromises()
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-slip-confirm]').exists()).toBe(true)
    expect(wrapper.find('[data-save]').text()).toBe('Registar prognóstico')
  })

  it('goes back to Enviar on Cancelar', async () => {
    setup(vi.fn<Invoke>().mockResolvedValue({ data: read, error: null }))
    const wrapper = render()
    await choose(wrapper)
    await flushPromises()
    const cancel = wrapper
      .findAll('[data-slip-confirm] button')
      .find((b) => b.text() === 'Cancelar')!
    await cancel.trigger('click')
    expect(wrapper.find('[data-slip-confirm]').exists()).toBe(false)
    expect(wrapper.find('[data-drop-zone]').exists()).toBe(true)
  })
})
