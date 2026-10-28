<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import ConfidenceBadge from '@/components/ConfidenceBadge.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import { useLocale } from '@/composables/useLocale'
import { useTheme } from '@/composables/useTheme'
import { CONFIDENCE_LEVELS } from '@/domain/confidence'
import { formatPercent, numberFormat } from '@/domain/intl'
import {
  DEFAULT_MONEY_DISPLAY,
  DEFAULT_UNIT_VALUE,
  MONEY_DISPLAYS,
  UNIT_VALUE_PRESETS,
  formatDecimal,
  formatMoney,
  type MoneyDisplay,
} from '@/domain/money'
import { fairOdd } from '@/domain/value'
import { userMessage } from '@/lib/errors'
import { LOCALES, THEMES } from '@/lib/preferences'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'

const store = useSettingsStore()
const auth = useAuthStore()
const { t, locale, intlLocale, message, setLocale } = useLocale()
const { theme, setTheme } = useTheme()

const unitValue = ref<number | null>(DEFAULT_UNIT_VALUE)
const bankroll = ref<number | null>(null)
const moneyDisplay = ref<MoneyDisplay>(DEFAULT_MONEY_DISPLAY)
const loading = ref(true)
const saving = ref(false)
const saved = ref(false)
const error = ref<string | null>(null)

const displayOptions = computed(() =>
  MONEY_DISPLAYS.map((value) => ({ value, label: t(`settings.display.${value}`) })),
)
const localeOptions = computed(() =>
  LOCALES.map((value) => ({ value, label: t(`app.language.${value}`) })),
)
const themeOptions = computed(() =>
  THEMES.map((value) => ({ value, label: t(`settings.appearance.${value}`) })),
)

// Language and theme are per-device preferences shared with the header toggles, applied at once.
const localeModel = computed({ get: () => locale.value, set: setLocale })
const themeModel = computed({ get: () => theme.value, set: setTheme })

/** Whether the form differs from what is stored; an empty bankroll and 0 both mean none. */
const dirty = computed(() => {
  const row = store.settings
  if (!row) return false
  return (
    unitValue.value !== row.unit_value ||
    (bankroll.value || null) !== row.starting_bankroll_units ||
    moneyDisplay.value !== store.moneyDisplay
  )
})

const levels = computed(() =>
  CONFIDENCE_LEVELS.map((level) => {
    const probability = store.confidenceAnchors[level]
    return {
      level,
      label: t(`confidence.${level}`),
      probability: formatPercent(probability, intlLocale.value),
      fairOdd: formatDecimal(fairOdd(probability), intlLocale.value),
    }
  }),
)

const money = (units: number, display: MoneyDisplay, signed = true) =>
  formatMoney(units, unitValue.value ?? 0, display, { signed }, intlLocale.value)

const example = computed(() =>
  t('settings.unit.example', { units: money(1.8, 'units'), euros: money(1.8, 'euros') }),
)
const bankrollInEuros = computed(() =>
  !bankroll.value ? null : `= ${money(bankroll.value, 'euros', false)}`,
)

/** Preset buttons: `10 €` (PT) or `€10` (EN). */
const presetLabel = (euros: number) =>
  numberFormat(intlLocale.value, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(euros)

// The confirmation only describes what was saved; any edit makes it stale.
watch(
  [unitValue, bankroll, moneyDisplay],
  () => {
    saved.value = false
  },
  { flush: 'sync' },
)

onMounted(async () => {
  try {
    const row = await store.ensureLoaded()
    unitValue.value = row.unit_value
    bankroll.value = row.starting_bankroll_units
    moneyDisplay.value = store.moneyDisplay
  } catch (e) {
    error.value = userMessage(e, 'settings.loadFailed')
  } finally {
    loading.value = false
  }
})

async function save() {
  saving.value = true
  saved.value = false
  error.value = null
  try {
    const row = await store.update({
      unit_value: unitValue.value as number,
      starting_bankroll_units: bankroll.value,
      money_display: moneyDisplay.value,
    })
    // Shows what was stored (0 becomes empty) before confirming.
    unitValue.value = row.unit_value
    bankroll.value = row.starting_bankroll_units
    moneyDisplay.value = store.moneyDisplay
    saved.value = true
  } catch (e) {
    error.value = userMessage(e, 'settings.saveFailed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-2xl flex-col gap-4 lg:max-w-[1100px]">
    <h1 class="m-0 text-[22px] font-bold tracking-tight">{{ t('settings.title') }}</h1>

    <!-- Phone: one column. Desktop: the form on the left, the rest on the right (max 420px). -->
    <div
      class="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start lg:gap-6"
    >
      <form
        class="flex flex-col gap-6 rounded-2xl border border-eb-border bg-eb-surface p-4 sm:p-5"
        @submit.prevent="save"
      >
        <fieldset class="m-0 flex flex-col gap-3 border-0 p-0" :disabled="loading">
          <legend class="mb-1 p-0 text-[17px] font-bold">{{ t('settings.display.legend') }}</legend>
          <SegmentedControl
            v-model="moneyDisplay"
            :options="displayOptions"
            :label="t('settings.display.legend')"
          />
          <p class="m-0 text-sm text-eb-muted">
            {{ t('settings.display.help') }}
          </p>
        </fieldset>

        <fieldset class="m-0 flex flex-col gap-3 border-0 p-0" :disabled="loading">
          <legend class="mb-1 p-0 text-[17px] font-bold">{{ t('settings.unit.legend') }}</legend>
          <div class="flex flex-wrap gap-2">
            <Button
              v-for="preset in UNIT_VALUE_PRESETS"
              :key="preset"
              type="button"
              :label="presetLabel(preset)"
              :outlined="unitValue !== preset"
              :aria-pressed="unitValue === preset"
              class="min-h-11 min-w-16"
              @click="unitValue = preset"
            />
          </div>
          <label for="unit-value" class="text-[13px] font-semibold text-eb-muted">{{
            t('settings.unit.other')
          }}</label>
          <InputNumber
            v-model="unitValue"
            input-id="unit-value"
            :locale="intlLocale"
            mode="currency"
            currency="EUR"
            :min-fraction-digits="0"
            :max-fraction-digits="2"
            :min="0"
            input-class="min-h-11 w-full"
            fluid
          />
          <p class="m-0 text-sm text-eb-muted tabular-nums">{{ example }}</p>
        </fieldset>

        <fieldset class="m-0 flex flex-col gap-3 border-0 p-0" :disabled="loading">
          <legend class="mb-1 p-0 text-[17px] font-bold">
            {{ t('settings.bankroll.legend') }}
          </legend>
          <label for="bankroll" class="text-sm text-eb-muted">
            {{ t('settings.bankroll.help') }}
          </label>
          <InputNumber
            v-model="bankroll"
            input-id="bankroll"
            :locale="intlLocale"
            suffix=" u"
            :min-fraction-digits="0"
            :max-fraction-digits="2"
            :min="0"
            input-class="min-h-11 w-full"
            fluid
          />
          <p v-if="bankrollInEuros" class="m-0 text-sm text-eb-muted tabular-nums">
            {{ bankrollInEuros }}
          </p>
        </fieldset>

        <Message v-if="error" severity="error">{{ message(error) }}</Message>
        <p
          v-if="saved"
          role="status"
          class="m-0 rounded-xl bg-eb-pos-soft px-3 py-2.5 text-sm font-semibold text-eb-pos"
        >
          {{ t('settings.saved') }}
        </p>
        <Button
          type="submit"
          :label="t(dirty ? 'settings.save' : 'settings.unchanged')"
          :loading="saving"
          :disabled="loading || !dirty"
          class="min-h-11 w-full"
        />
      </form>

      <div class="flex flex-col gap-4">
        <section
          class="flex flex-col gap-3 rounded-2xl border border-eb-border bg-eb-surface p-4 sm:p-5"
        >
          <h2 class="m-0 text-[17px] font-bold">{{ t('settings.appearance.title') }}</h2>
          <h3 class="m-0 text-[13px] font-semibold text-eb-muted">
            {{ t('settings.appearance.language') }}
          </h3>
          <SegmentedControl
            v-model="localeModel"
            :options="localeOptions"
            :label="t('settings.appearance.language')"
          />
          <h3 class="m-0 text-[13px] font-semibold text-eb-muted">
            {{ t('settings.appearance.theme') }}
          </h3>
          <SegmentedControl
            v-model="themeModel"
            :options="themeOptions"
            :label="t('settings.appearance.theme')"
          />
          <p class="m-0 text-sm text-eb-muted">{{ t('settings.appearance.help') }}</p>
        </section>

        <section class="rounded-2xl border border-eb-border bg-eb-surface p-4 sm:p-5">
          <h2 class="m-0 text-[17px] font-bold">{{ t('settings.levels.title') }}</h2>
          <p class="mt-1 text-sm text-eb-muted">
            {{ t('settings.levels.help') }}
          </p>
          <table class="mt-3 w-full border-collapse text-left">
            <thead>
              <tr class="border-b border-eb-border text-sm text-eb-muted">
                <th class="py-2 pr-3 font-medium">{{ t('settings.levels.level') }}</th>
                <th class="py-2 pr-3 text-right font-medium">
                  {{ t('settings.levels.probability') }}
                </th>
                <th class="py-2 text-right font-medium">{{ t('settings.levels.fairOdd') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in levels"
                :key="row.level"
                class="border-b border-eb-border last:border-0"
              >
                <td class="py-2.5 pr-3">
                  <span class="flex items-center gap-2.5">
                    <ConfidenceBadge :level="row.level" />
                    {{ row.label }}
                  </span>
                </td>
                <td class="py-2.5 pr-3 text-right tabular-nums">{{ row.probability }}</td>
                <td class="py-2.5 text-right tabular-nums">{{ row.fairOdd }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section
          v-if="auth.session"
          class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-eb-border bg-eb-surface p-4 sm:p-5"
        >
          <div class="min-w-0">
            <h2 class="m-0 text-[17px] font-bold">{{ t('settings.account.title') }}</h2>
            <p class="mt-1 mb-0 text-sm break-all text-eb-muted">{{ auth.session.user.email }}</p>
          </div>
          <Button
            type="button"
            :label="t('settings.account.signOut')"
            severity="secondary"
            outlined
            class="min-h-11"
            @click="auth.signOut()"
          />
        </section>
      </div>
    </div>
  </div>
</template>
