import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import AutoComplete from 'primevue/autocomplete'
import type { EventSearchResult, EventSource } from '@/domain/eventSource'
import GamePicker from '../GamePicker.vue'

const result = (homeTeam: string): EventSearchResult => ({
  eventId: `id-${homeTeam}`,
  source: 'manual',
  externalId: null,
  kickoffAt: '2026-10-27T20:00:00Z',
  leagueName: null,
  homeTeam,
  awayTeam: 'Porto',
})

/** A source whose searches resolve or fail only when the test says so. */
function controlledSource() {
  const pending = new Map<
    string,
    { resolve: (results: EventSearchResult[]) => void; reject: (e: unknown) => void }
  >()
  const source: EventSource = {
    search: (query) => new Promise((resolve, reject) => pending.set(query, { resolve, reject })),
  }
  return { source, pending }
}

function render(source: EventSource) {
  return mount(GamePicker, {
    props: { game: null, newGame: null, errors: {}, kept: false, source },
    global: { plugins: [PrimeVue] },
  })
}

const search = (wrapper: ReturnType<typeof render>, query: string) =>
  wrapper.findComponent(AutoComplete).vm.$emit('complete', { query })

beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GamePicker', () => {
  it('ignores a slow earlier search that answers after the latest one', async () => {
    const { source, pending } = controlledSource()
    const wrapper = render(source)

    search(wrapper, 'Ben')
    search(wrapper, 'Benfica')
    pending.get('Benfica')!.resolve([result('Benfica')])
    await flushPromises()
    pending.get('Ben')!.resolve([result('Benfica'), result('Benfica B')])
    await flushPromises()

    expect(wrapper.findComponent(AutoComplete).props('suggestions')).toEqual([result('Benfica')])
  })

  it('shows a failed search under the game field, in PT-PT', async () => {
    const { source, pending } = controlledSource()
    const wrapper = render(source)

    search(wrapper, 'Ben')
    pending.get('Ben')!.reject(new TypeError('Failed to fetch'))
    await flushPromises()

    expect(wrapper.text()).toContain('Não foi possível procurar jogos.')
    expect(wrapper.text()).not.toContain('Failed to fetch')
  })

  it('marks the game kept after a save as "Mesmo jogo"', async () => {
    const wrapper = render(controlledSource().source)
    await wrapper.setProps({ game: result('Benfica'), kept: true })
    expect(wrapper.text()).toContain('Mesmo jogo')
    await wrapper.setProps({ kept: false })
    expect(wrapper.text()).not.toContain('Mesmo jogo')
  })
})
