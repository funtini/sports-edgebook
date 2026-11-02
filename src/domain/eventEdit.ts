import type { NewGameForm } from './schemas'

/** What an event's form starts from: its kickoff and names as stored. */
export interface EditableEvent {
  kickoff_at: string
  league: { name: string } | null
  home_team: { name: string }
  away_team: { name: string }
}

/** The teams and kickoff that decide whether two events are the same game. */
export interface GameIdentity {
  id: string
  kickoff_at: string
  home_team_id: string
  away_team_id: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** A stored event as "Editar evento"'s fields: date and time in the user's local time. */
export function eventEditDraftFrom(event: EditableEvent): NewGameForm {
  const kickoff = new Date(event.kickoff_at)
  return {
    date: `${kickoff.getFullYear()}-${pad(kickoff.getMonth() + 1)}-${pad(kickoff.getDate())}`,
    time: `${pad(kickoff.getHours())}:${pad(kickoff.getMinutes())}`,
    league: event.league?.name ?? '',
    home: event.home_team.name,
    away: event.away_team.name,
  }
}

/** The local day `kickoffAt` falls on, as `[from, to)`. */
export function localDay(kickoffAt: string): { from: Date; to: Date } {
  const kickoff = new Date(kickoffAt)
  const from = new Date(kickoff.getFullYear(), kickoff.getMonth(), kickoff.getDate())
  const to = new Date(kickoff.getFullYear(), kickoff.getMonth(), kickoff.getDate() + 1)
  return { from, to }
}

/** Same two teams, home and away in either order. */
export function sameTeams(a: GameIdentity, b: GameIdentity): boolean {
  return (
    (a.home_team_id === b.home_team_id && a.away_team_id === b.away_team_id) ||
    (a.home_team_id === b.away_team_id && a.away_team_id === b.home_team_id)
  )
}

/**
 * Another event that is the same game as `edited`: the same two teams (either order) on the same
 * local day, nearest kickoff first. `edited.id` itself never counts.
 */
export function findSameGame<T extends GameIdentity>(
  edited: GameIdentity,
  candidates: readonly T[],
): T | null {
  const { from, to } = localDay(edited.kickoff_at)
  const at = new Date(edited.kickoff_at).getTime()
  const distance = (e: GameIdentity) => Math.abs(new Date(e.kickoff_at).getTime() - at)
  const matches = candidates.filter((e) => {
    const kickoff = new Date(e.kickoff_at)
    return e.id !== edited.id && kickoff >= from && kickoff < to && sameTeams(edited, e)
  })
  return matches.sort((a, b) => distance(a) - distance(b))[0] ?? null
}

interface Score {
  home_score: number | null
  away_score: number | null
}

/** Score the kept event ends with after a merge: its own, or the merged one's when it has none. */
export function mergedScore(kept: Score, merged: Score): Score {
  if (kept.home_score != null && kept.away_score != null) {
    return { home_score: kept.home_score, away_score: kept.away_score }
  }
  return { home_score: merged.home_score, away_score: merged.away_score }
}
