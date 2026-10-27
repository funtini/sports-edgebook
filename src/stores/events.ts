import { defineStore } from 'pinia'
import { eventCreateSchema, type EventCreate } from '@/domain/schemas'
import { sortUpcomingFirst } from '@/domain/eventSource'
import type { EventWithTeams } from '@/types/db'
import { EVENT_SELECT, escapeLike, requireSupabase, unwrap } from './client'

const SEARCH_LIMIT = 50

export const useEventsStore = defineStore('events', () => {
  async function create(input: EventCreate): Promise<EventWithTeams> {
    const event = eventCreateSchema.parse(input)
    return unwrap<EventWithTeams>(
      await requireSupabase().from('events').insert(event).select(EVENT_SELECT).single(),
    )
  }

  async function getById(id: string): Promise<EventWithTeams | null> {
    return unwrap<EventWithTeams | null>(
      await requireSupabase().from('events').select(EVENT_SELECT).eq('id', id).maybeSingle(),
    )
  }

  /**
   * Events where either team's name or alias contains `query`, upcoming first.
   * An empty query lists the next upcoming events.
   */
  async function search(query: string): Promise<EventWithTeams[]> {
    const db = requireSupabase()
    const now = new Date()
    const q = query.trim()

    if (!q) {
      return unwrap<EventWithTeams[]>(
        await db
          .from('events')
          .select(EVENT_SELECT)
          .gte('kickoff_at', now.toISOString())
          .order('kickoff_at')
          .limit(SEARCH_LIMIT),
      )
    }

    const pattern = `%${escapeLike(q)}%`
    const [teams, aliases] = await Promise.all([
      db.from('teams').select('id').ilike('name', pattern),
      db.from('team_aliases').select('team_id').ilike('alias', pattern),
    ])
    const teamIds = new Set([
      ...unwrap<{ id: string }[]>(teams).map((t) => t.id),
      ...unwrap<{ team_id: string }[]>(aliases).map((a) => a.team_id),
    ])
    if (teamIds.size === 0) return []

    const ids = [...teamIds].join(',')
    const events = unwrap<EventWithTeams[]>(
      await db
        .from('events')
        .select(EVENT_SELECT)
        .or(`home_team_id.in.(${ids}),away_team_id.in.(${ids})`)
        .order('kickoff_at', { ascending: false })
        .limit(SEARCH_LIMIT),
    )
    return sortUpcomingFirst(events, now)
  }

  return { create, getById, search }
})
