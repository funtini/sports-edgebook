import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { argsOf, fakeSupabase, has, type Query } from '@/stores/__tests__/fakeSupabase'
import type { EventWithTeams } from '@/types/db'
import EventEditDialog from '../EventEditDialog.vue'

const mocked = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocked.client
  },
}))

const EVENT = '0b9f7c1e-3d1a-4c9e-9a51-1f2d3c4b5a60'
const OTHER = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
const WRONG_HOME = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f60'
const WRONG_AWAY = '3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6071'
const MARITIMO = '4f5a6b7c-8d9e-4f0a-9b1c-2d3e4f5a6b7c'
const SANTA_CLARA = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d'
const LEAGUE = '6b7c8d9e-0f1a-4b2c-9d3e-4f5a6b7c8d9e'
const KICKOFF = new Date(2026, 10, 2, 20, 0).toISOString()

const team = (id: string, name: string) => ({ id, name })
const event = (overrides: Partial<EventWithTeams> = {}) =>
  ({
    id: EVENT,
    kickoff_at: KICKOFF,
    home_score: null,
    away_score: null,
    league_id: LEAGUE,
    home_team_id: WRONG_HOME,
    away_team_id: WRONG_AWAY,
    home_team: team(WRONG_HOME, 'Cantos Marítimo'),
    away_team: team(WRONG_AWAY, 'Cantos Santa Clara'),
    league: { id: LEAGUE, name: 'Liga Portugal' },
    ...overrides,
  }) as EventWithTeams

const existing = event({
  id: OTHER,
  home_team_id: MARITIMO,
  away_team_id: SANTA_CLARA,
  home_team: team(MARITIMO, 'Marítimo') as never,
  away_team: team(SANTA_CLARA, 'Santa Clara') as never,
})

const TEAMS: Record<string, string> = {
  'cantos marítimo': WRONG_HOME,
  'cantos santa clara': WRONG_AWAY,
  marítimo: MARITIMO,
  'santa clara': SANTA_CLARA,
}

function setup({ sameDay = [] as EventWithTeams[], fail = false } = {}) {
  const fake = fakeSupabase((q: Query) => {
    const ilike = argsOf(q, 'ilike')?.[1] as string | undefined
    if (q.table === 'leagues') return { data: ilike ? [{ id: LEAGUE, name: ilike }] : [] }
    if (q.table === 'teams') {
      if (has(q, 'delete')) return { data: null }
      if (!ilike) return { data: [] }
      return { data: [team(TEAMS[ilike.toLowerCase()]!, ilike)] }
    }
    if (q.table === 'predictions') return { data: null }
    // events
    if (has(q, 'gte')) return { data: sameDay }
    if (has(q, 'or')) return { data: [] }
    if (has(q, 'delete')) return { data: null }
    if (has(q, 'update')) {
      if (fail) return { error: { message: 'boom' } }
      const fields = argsOf(q, 'update')![0] as Record<string, string>
      return {
        data: event({
          ...fields,
          home_team: team(fields.home_team_id!, 'Marítimo') as never,
          away_team: team(fields.away_team_id!, 'Santa Clara') as never,
        }),
      }
    }
    return { data: [] }
  })
  mocked.client = fake.client
  return fake.queries
}

const mounted: VueWrapper[] = []
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

async function render(row = event()) {
  const wrapper = mount(EventEditDialog, {
    props: { event: row },
    global: { plugins: [PrimeVue, ToastService] },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

async function rename(wrapper: VueWrapper, home: string, away: string) {
  await wrapper.get('#edit-home').setValue(home)
  await wrapper.get('#edit-away').setValue(away)
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('EventEditDialog', () => {
  it('starts from the event as stored', async () => {
    setup()
    const wrapper = await render()
    expect(wrapper.get('#event-edit-title').text()).toBe('Editar evento')
    expect(wrapper.get('[data-event]').text()).toBe('Cantos Marítimo – Cantos Santa Clara')
    expect((wrapper.get('#edit-date').element as HTMLInputElement).value).toBe('2026-11-02')
    expect((wrapper.get('#edit-time').element as HTMLInputElement).value).toBe('20:00')
    expect((wrapper.get('#edit-league').element as HTMLInputElement).value).toBe('Liga Portugal')
    expect((wrapper.get('#edit-home').element as HTMLInputElement).value).toBe('Cantos Marítimo')
  })

  it('saves the corrected teams and removes the teams left unused', async () => {
    const queries = setup()
    const wrapper = await render()
    await rename(wrapper, 'Marítimo', 'Santa Clara')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const update = queries.find((q) => q.table === 'events' && has(q, 'update'))!
    expect(argsOf(update, 'update')![0]).toEqual({
      kickoff_at: KICKOFF,
      league_id: LEAGUE,
      home_team_id: MARITIMO,
      away_team_id: SANTA_CLARA,
    })
    const deleted = queries
      .filter((q) => q.table === 'teams' && has(q, 'delete'))
      .map((q) => argsOf(q, 'eq')![1])
    expect(deleted).toEqual([WRONG_HOME, WRONG_AWAY])
    const saved = wrapper.emitted('saved')![0]![0] as EventWithTeams
    expect(saved.home_team.name).toBe('Marítimo')
  })

  it('shows field errors without saving', async () => {
    const queries = setup()
    const wrapper = await render()
    await rename(wrapper, 'Marítimo', ' marítimo ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('A equipa da casa e a de fora têm de ser diferentes')
    expect(queries.some((q) => has(q, 'update'))).toBe(false)
  })

  it('offers to merge into an existing event with the same game', async () => {
    const queries = setup({ sameDay: [event(), existing] })
    const wrapper = await render()
    await rename(wrapper, 'Marítimo', 'Santa Clara')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-duplicate]').text()).toContain('Este jogo já existe')
    expect(queries.some((q) => q.table === 'events' && has(q, 'update'))).toBe(false)

    await wrapper.get('[data-merge]').trigger('click')
    await flushPromises()

    const moved = queries.find((q) => q.table === 'predictions')!
    expect(argsOf(moved, 'update')).toEqual([{ event_id: OTHER }])
    const removed = queries.find((q) => q.table === 'events' && has(q, 'delete'))!
    expect(argsOf(removed, 'eq')).toEqual(['id', EVENT])
    expect((wrapper.emitted('merged')![0]![0] as EventWithTeams).id).toBe(OTHER)
  })

  it('drops the merge offer when the fields change', async () => {
    setup({ sameDay: [existing] })
    const wrapper = await render()
    await rename(wrapper, 'Marítimo', 'Santa Clara')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-duplicate]').exists()).toBe(true)

    await wrapper.get('#edit-time').setValue('21:00')
    expect(wrapper.find('[data-duplicate]').exists()).toBe(false)
  })

  it('keeps the dialog open with a message when saving fails', async () => {
    setup({ fail: true })
    const wrapper = await render()
    await rename(wrapper, 'Marítimo', 'Santa Clara')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Não foi possível guardar as alterações.')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })
})
