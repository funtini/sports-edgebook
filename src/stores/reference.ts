import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { LeagueRow, TeamRow } from '@/types/db'
import { cleanName, escapeLike, requireSupabase, unwrap } from './client'

/** Leagues and teams: the lists the logging form autocompletes from. */
export const useReferenceStore = defineStore('reference', () => {
  const leagues = ref<LeagueRow[]>([])
  const teams = ref<TeamRow[]>([])

  async function load() {
    const db = requireSupabase()
    const [l, t] = await Promise.all([
      db.from('leagues').select('*').order('name'),
      db.from('teams').select('*').order('name'),
    ])
    leagues.value = unwrap<LeagueRow[]>(l)
    teams.value = unwrap<TeamRow[]>(t)
  }

  /** Existing league with this name (any case), or a new one. */
  async function ensureLeague(name: string): Promise<LeagueRow> {
    const clean = cleanName(name)
    const db = requireSupabase()
    const found = unwrap<LeagueRow[]>(
      await db.from('leagues').select('*').ilike('name', escapeLike(clean)).limit(1),
    )
    if (found[0]) return found[0]
    const created = unwrap<LeagueRow>(
      await db.from('leagues').insert({ name: clean }).select().single(),
    )
    leagues.value.push(created)
    return created
  }

  /** Existing team with this name (any case, any league), or a new one in `leagueId`. */
  async function ensureTeam(name: string, leagueId: string | null): Promise<TeamRow> {
    const clean = cleanName(name)
    const db = requireSupabase()
    const found = unwrap<TeamRow[]>(
      await db.from('teams').select('*').ilike('name', escapeLike(clean)).limit(1),
    )
    if (found[0]) return found[0]
    const created = unwrap<TeamRow>(
      await db.from('teams').insert({ name: clean, league_id: leagueId }).select().single(),
    )
    teams.value.push(created)
    return created
  }

  return { leagues, teams, load, ensureLeague, ensureTeam }
})
