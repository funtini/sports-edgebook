import { defineStore } from 'pinia'
import {
  eventCreateSchema,
  eventScoreSchema,
  idSchema,
  type EventCreate,
  type EventScore,
} from '@/domain/schemas'
import { localDay, mergedScore } from '@/domain/eventEdit'
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

  /** Null when there is no such event, including when `id` is not a valid id. */
  async function getById(id: string): Promise<EventWithTeams | null> {
    if (!idSchema.safeParse(id).success) return null
    return unwrap<EventWithTeams | null>(
      await requireSupabase().from('events').select(EVENT_SELECT).eq('id', id).maybeSingle(),
    )
  }

  /** Sets the final score, or clears it with both goals null. */
  async function setScore(id: string, score: EventScore): Promise<EventWithTeams> {
    const eventId = idSchema.parse(id)
    const { home_score, away_score } = eventScoreSchema.parse(score)
    return unwrap<EventWithTeams>(
      await requireSupabase()
        .from('events')
        .update({ home_score, away_score })
        .eq('id', eventId)
        .select(EVENT_SELECT)
        .single(),
    )
  }

  /** Corrects an event's kickoff, league and teams ("Editar evento"); the score stays. */
  async function update(id: string, input: EventCreate): Promise<EventWithTeams> {
    const eventId = idSchema.parse(id)
    const { kickoff_at, league_id, home_team_id, away_team_id } = eventCreateSchema.parse(input)
    return unwrap<EventWithTeams>(
      await requireSupabase()
        .from('events')
        .update({ kickoff_at, league_id: league_id ?? null, home_team_id, away_team_id })
        .eq('id', eventId)
        .select(EVENT_SELECT)
        .single(),
    )
  }

  /** Events on the local day of `kickoffAt`, where a corrected event's duplicate would be. */
  async function onDayOf(kickoffAt: string): Promise<EventWithTeams[]> {
    const { from, to } = localDay(kickoffAt)
    return unwrap<EventWithTeams[]>(
      await requireSupabase()
        .from('events')
        .select(EVENT_SELECT)
        .gte('kickoff_at', from.toISOString())
        .lt('kickoff_at', to.toISOString())
        .order('kickoff_at'),
    )
  }

  /**
   * Joins `source` into `kept`, the same game logged twice: the predictions move to `kept`, which
   * takes `source`'s score when it has none, and `source` is deleted. Predictions move first, so a
   * failure later never loses one.
   */
  async function merge(source: EventWithTeams, kept: EventWithTeams): Promise<EventWithTeams> {
    const sourceId = idSchema.parse(source.id)
    const keptId = idSchema.parse(kept.id)
    if (sourceId === keptId) throw new Error('Cannot merge an event into itself')
    const db = requireSupabase()
    unwrap(await db.from('predictions').update({ event_id: keptId }).eq('event_id', sourceId))
    const score = mergedScore(kept, source)
    const result =
      score.home_score === kept.home_score && score.away_score === kept.away_score
        ? kept
        : await setScore(keptId, score)
    unwrap(await db.from('events').delete().eq('id', sourceId))
    return result
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

  return { create, getById, setScore, update, onDayOf, merge, search }
})
