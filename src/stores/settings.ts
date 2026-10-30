import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { DEFAULT_CONFIDENCE_ANCHORS, type ConfidenceAnchors } from '@/domain/confidence'
import { DEFAULT_ODDS_BANDS } from '@/domain/metrics'
import { DEFAULT_MONEY_DISPLAY, DEFAULT_UNIT_VALUE, type MoneyDisplay } from '@/domain/money'
import {
  confidenceAnchorsSchema,
  userSettingsUpdateSchema,
  type UserSettingsUpdate,
} from '@/domain/schemas'
import type { UserSettingsRow } from '@/types/db'
import { requireSupabase, unwrap } from './client'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<UserSettingsRow | null>(null)
  let loading: Promise<UserSettingsRow> | null = null

  const unitValue = computed(() => settings.value?.unit_value ?? DEFAULT_UNIT_VALUE)
  const moneyDisplay = computed<MoneyDisplay>(() =>
    settings.value?.money_display === 'euros' ? 'euros' : DEFAULT_MONEY_DISPLAY,
  )

  const oddsBands = computed<readonly number[]>(
    () => settings.value?.odds_bands ?? DEFAULT_ODDS_BANDS,
  )

  const confidenceAnchors = computed<ConfidenceAnchors>(() => {
    const parsed = confidenceAnchorsSchema.safeParse(settings.value?.confidence_anchors)
    return parsed.success ? parsed.data : DEFAULT_CONFIDENCE_ANCHORS
  })

  /** Loads `user_settings`; on first use creates the row with defaults. */
  async function load(): Promise<UserSettingsRow> {
    const db = requireSupabase()
    let row = unwrap<UserSettingsRow | null>(
      await db.from('user_settings').select('*').maybeSingle(),
    )
    if (!row) {
      row = unwrap<UserSettingsRow>(await db.from('user_settings').insert({}).select().single())
    }
    settings.value = row
    return row
  }

  /** Loads once; later calls reuse the loaded row. */
  async function ensureLoaded(): Promise<UserSettingsRow> {
    if (settings.value) return settings.value
    loading ??= load().finally(() => {
      loading = null
    })
    return loading
  }

  /** Validates and saves the fields edited on the settings screen. */
  async function update(input: UserSettingsUpdate): Promise<UserSettingsRow> {
    const patch = userSettingsUpdateSchema.parse(input)
    const { user_id } = await ensureLoaded()
    const row = unwrap<UserSettingsRow>(
      await requireSupabase()
        .from('user_settings')
        .update(patch)
        .eq('user_id', user_id)
        .select()
        .single(),
    )
    settings.value = row
    return row
  }

  return {
    settings,
    unitValue,
    moneyDisplay,
    oddsBands,
    confidenceAnchors,
    load,
    ensureLoaded,
    update,
  }
})
