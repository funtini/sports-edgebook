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

/** An event offered under the search on Registo: one recently logged on, with its prediction count. */
export interface RecentEvent {
  event: EventSearchResult
  predictions: number
}

/**
 * The `limit` events with the most recently logged predictions, newest first, leaving out events
 * that already have a result (nothing more to log on them). `rows` are predictions with their event.
 */
export function recentEvents(
  rows: { created_at: string; event: EventWithTeams }[],
  limit = 3,
): RecentEvent[] {
  const byEvent = new Map<string, { event: EventWithTeams; latest: string; predictions: number }>()
  for (const { created_at, event } of rows) {
    if (event.home_score != null) continue
    const seen = byEvent.get(event.id)
    if (!seen) byEvent.set(event.id, { event, latest: created_at, predictions: 1 })
    else {
      seen.predictions += 1
      if (created_at > seen.latest) seen.latest = created_at
    }
  }
  return [...byEvent.values()]
    .sort((a, b) => b.latest.localeCompare(a.latest))
    .slice(0, limit)
    .map(({ event, predictions }) => ({ event: toSearchResult(event), predictions }))
}
