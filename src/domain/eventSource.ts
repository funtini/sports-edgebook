import type { EventWithTeams, Source } from '@/types/db'

/** One game offered by search, whether it is already in the database or not. */
export interface EventSearchResult {
  /** Id in `events`; null for a game an external source offers that is not stored yet (phase 5). */
  eventId: string | null
  source: Source
  externalId: string | null
  kickoffAt: string
  leagueName: string | null
  homeTeam: string
  awayTeam: string
}

/** Game search used by the logging UI. Phase 5 adds an API-backed implementation. */
export interface EventSource {
  search(query: string): Promise<EventSearchResult[]>
}

export interface EventSearcher {
  search(query: string): Promise<EventWithTeams[]>
}

export function toSearchResult(event: EventWithTeams): EventSearchResult {
  return {
    eventId: event.id,
    source: event.source,
    externalId: event.external_id,
    kickoffAt: event.kickoff_at,
    leagueName: event.league?.name ?? null,
    homeTeam: event.home_team.name,
    awayTeam: event.away_team.name,
  }
}

/** Searches the events already logged, through the events store. */
export class LocalEventSource implements EventSource {
  constructor(private readonly events: EventSearcher) {}

  async search(query: string): Promise<EventSearchResult[]> {
    return (await this.events.search(query)).map(toSearchResult)
  }
}

/** Upcoming games first (soonest first), then past games (most recent first). */
export function sortUpcomingFirst<T extends { kickoff_at: string }>(events: T[], now: Date): T[] {
  const nowMs = now.getTime()
  const time = (e: T) => Date.parse(e.kickoff_at)
  const upcoming = events.filter((e) => time(e) >= nowMs).sort((a, b) => time(a) - time(b))
  const past = events.filter((e) => time(e) < nowMs).sort((a, b) => time(b) - time(a))
  return [...upcoming, ...past]
}
