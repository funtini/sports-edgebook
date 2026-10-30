import { describe, expect, it } from 'vitest'
import { LocalEventSource, recentEvents, sortUpcomingFirst } from '../eventSource'
import type { EventWithTeams, LeagueRow, TeamRow } from '@/types/db'

function team(name: string): TeamRow {
  return {
    id: name,
    user_id: 'u',
    name,
    league_id: null,
    source: 'manual',
    external_id: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

const liga: LeagueRow = {
  id: 'liga',
  user_id: 'u',
  name: 'Liga Portugal',
  country: 'Portugal',
  source: 'manual',
  external_id: null,
  created_at: '2026-01-01T00:00:00Z',
}

function event(id: string, kickoff_at: string, league: LeagueRow | null = null): EventWithTeams {
  return {
    id,
    user_id: 'u',
    kickoff_at,
    league_id: league?.id ?? null,
    home_team_id: 'Benfica',
    away_team_id: 'Porto',
    home_score: null,
    away_score: null,
    source: 'manual',
    external_id: null,
    created_at: '2026-01-01T00:00:00Z',
    home_team: team('Benfica'),
    away_team: team('Porto'),
    league,
  }
}

describe('sortUpcomingFirst', () => {
  it('lists upcoming games soonest first, then past games most recent first', () => {
    const now = new Date('2026-10-27T12:00:00Z')
    const events = [
      event('past-old', '2026-10-01T20:00:00Z'),
      event('later', '2026-11-03T20:00:00Z'),
      event('past-recent', '2026-10-26T20:00:00Z'),
      event('soon', '2026-10-27T20:00:00Z'),
    ]
    expect(sortUpcomingFirst(events, now).map((e) => e.id)).toEqual([
      'soon',
      'later',
      'past-recent',
      'past-old',
    ])
  })
})

describe('LocalEventSource', () => {
  it('maps stored events to search results', async () => {
    const source = new LocalEventSource({
      search: async () => [event('e1', '2026-10-27T20:00:00Z', liga)],
    })
    expect(await source.search('benfica')).toEqual([
      {
        eventId: 'e1',
        source: 'manual',
        externalId: null,
        kickoffAt: '2026-10-27T20:00:00Z',
        leagueName: 'Liga Portugal',
        homeTeam: 'Benfica',
        awayTeam: 'Porto',
      },
    ])
  })
})

describe('recentEvents', () => {
  const a = event('a', '2026-10-30T20:00:00Z')
  const b = event('b', '2026-10-31T13:30:00Z')
  const c = event('c', '2026-10-31T14:00:00Z')
  const d = event('d', '2026-11-01T18:00:00Z')
  const finished = { ...event('f', '2026-10-29T20:00:00Z'), home_score: 2, away_score: 1 }
  const at = (event: EventWithTeams, created_at: string) => ({ event, created_at })

  it('takes the events logged on most recently, with their prediction counts', () => {
    const rows = [
      at(a, '2026-10-30T10:00:00Z'),
      at(b, '2026-10-30T11:00:00Z'),
      at(a, '2026-10-30T12:00:00Z'),
      at(c, '2026-10-30T09:00:00Z'),
      at(d, '2026-10-30T08:00:00Z'),
    ]
    expect(recentEvents(rows).map((r) => [r.event.eventId, r.predictions])).toEqual([
      ['a', 2],
      ['b', 1],
      ['c', 1],
    ])
  })

  it('leaves out events that already have a result', () => {
    const rows = [at(finished, '2026-10-30T12:00:00Z'), at(a, '2026-10-30T10:00:00Z')]
    expect(recentEvents(rows).map((r) => r.event.eventId)).toEqual(['a'])
  })
})
