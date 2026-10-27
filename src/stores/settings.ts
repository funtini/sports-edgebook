import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { DEFAULT_CONFIDENCE_ANCHORS, type ConfidenceAnchors } from '@/domain/confidence'
import { DEFAULT_MARKETS } from '@/domain/markets'
import { confidenceAnchorsSchema } from '@/domain/schemas'
import type { UserSettingsRow } from '@/types/db'
import { requireSupabase, unwrap } from './client'

const DEFAULT_UNIT_VALUE = 10

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<UserSettingsRow | null>(null)
  let loading: Promise<UserSettingsRow> | null = null

  const unitValue = computed(() => settings.value?.unit_value ?? DEFAULT_UNIT_VALUE)

  const confidenceAnchors = computed<ConfidenceAnchors>(() => {
    const parsed = confidenceAnchorsSchema.safeParse(settings.value?.confidence_anchors)
    return parsed.success ? parsed.data : DEFAULT_CONFIDENCE_ANCHORS
  })

  /** Loads `user_settings`; on first use creates the row with defaults and seeds the default markets. */
  async function load(): Promise<UserSettingsRow> {
    const db = requireSupabase()
    let row = unwrap<UserSettingsRow | null>(
      await db.from('user_settings').select('*').maybeSingle(),
    )
    if (!row) {
      row = unwrap<UserSettingsRow>(await db.from('user_settings').insert({}).select().single())
      unwrap(
        await db.from('markets').upsert([...DEFAULT_MARKETS], {
          onConflict: 'user_id,category,name',
          ignoreDuplicates: true,
        }),
      )
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

  return { settings, unitValue, confidenceAnchors, load, ensureLoaded }
})
