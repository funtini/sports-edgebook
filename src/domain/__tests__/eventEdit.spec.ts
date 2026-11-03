import { describe, expect, it } from 'vitest'
import { eventEditDraftFrom, findSameGame, localDay, mergedScore, sameTeams } from '../eventEdit'

const game = (id: string, kickoff_at: string, home = 'h', away = 'a') => ({
  id,
  kickoff_at,
  home_team_id: home,
  away_team_id: away,
})

describe('eventEditDraftFrom', () => {
  it('fills the fields from the stored event, in local time', () => {
    const kickoff = new Date(2026, 9, 27, 20, 15)
    expect(
      eventEditDraftFrom({
        kickoff_at: kickoff.toISOString(),
        league: { name: 'Liga Portugal' },
        home_team: { name: 'Cantos Marítimo' },
        away_team: { name: 'Cantos Santa Clara' },
      }),
    ).toEqual({
      date: '2026-10-27',
      time: '20:15',
      league: 'Liga Portugal',
      home: 'Cantos Marítimo',
      away: 'Cantos Santa Clara',
    })
  })

  it('leaves the league empty when the event has none', () => {
    const draft = eventEditDraftFrom({
      kickoff_at: new Date(2026, 0, 5, 9, 5).toISOString(),
      league: null,
      home_team: { name: 'A' },
      away_team: { name: 'B' },
    })
    expect(draft).toMatchObject({ date: '2026-01-05', time: '09:05', league: '' })
  })
})

describe('localDay', () => {
  it('spans the local day of the kickoff', () => {
    const { from, to } = localDay(new Date(2026, 9, 27, 23, 30).toISOString())
    expect(from).toEqual(new Date(2026, 9, 27))
    expect(to).toEqual(new Date(2026, 9, 28))
  })
})

describe('sameTeams', () => {
  it('matches the same teams in either order', () => {
    expect(sameTeams(game('1', ''), game('2', ''))).toBe(true)
    expect(sameTeams(game('1', ''), game('2', '', 'a', 'h'))).toBe(true)
    expect(sameTeams(game('1', ''), game('2', '', 'h', 'x'))).toBe(false)
  })
})

describe('findSameGame', () => {
  const at = (hour: number, day = 27) => new Date(2026, 9, day, hour).toISOString()

  it('finds another event with the same teams on the same day, nearest kickoff first', () => {
    const edited = game('self', at(20))
    const found = findSameGame(edited, [
      game('self', at(20)),
      game('far', at(12)),
      game('near', at(19), 'a', 'h'),
      game('other', at(20), 'h', 'x'),
    ])
    expect(found?.id).toBe('near')
  })

  it('ignores the event itself and other days', () => {
    const edited = game('self', at(20))
    expect(findSameGame(edited, [game('self', at(20)), game('next', at(20, 28))])).toBeNull()
  })
})

describe('mergedScore', () => {
  it("keeps the kept event's score", () => {
    expect(mergedScore({ home_score: 1, away_score: 0 }, { home_score: 2, away_score: 2 })).toEqual(
      { home_score: 1, away_score: 0 },
    )
  })

  it("takes the merged event's score when the kept one has none", () => {
    expect(
      mergedScore({ home_score: null, away_score: null }, { home_score: 2, away_score: 2 }),
    ).toEqual({ home_score: 2, away_score: 2 })
  })
})
