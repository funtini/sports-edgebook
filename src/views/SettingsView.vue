<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import { useLocale } from '@/composables/useLocale'
import { CONFIDENCE_LEVELS } from '@/domain/confidence'
import {
  DEFAULT_MONEY_DISPLAY,
  DEFAULT_UNIT_VALUE,
  UNIT_VALUE_PRESETS,
  formatDecimal,
  formatMoney,
  type MoneyDisplay,
} from '@/domain/money'
import { fairOdd } from '@/domain/value'
import { userMessage } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'

const store = useSettingsStore()
const auth = useAuthStore()
const { t, intlLocale, message } = useLocale()

const unitValue = ref<number | null>(DEFAULT_UNIT_VALUE)
const bankroll = ref<number | null>(null)
const moneyDisplay = ref<MoneyDisplay>(DEFAULT_MONEY_DISPLAY)
const loading = ref(true)
const saving = ref(false)
const saved = ref(false)
const error = ref<string | null>(null)

const levels = computed(() => {
  const percent = new Intl.NumberFormat(intlLocale.value, { style: 'percent' })
  return CONFIDENCE_LEVELS.map((level) => {
    const probability = store.confidenceAnchors[level]
    return {
      level,
      label: t(`confidence.${level}`),
      probability: percent.format(probability),
      fairOdd: formatDecimal(fairOdd(probability), intlLocale.value),
    }
  })
})

const displays: MoneyDisplay[] = ['units', 'euros']

const money = (units: number, display: MoneyDisplay, signed = true) =>
  formatMoney(units, unitValue.value ?? 0, display, { signed }, intlLocale.value)

const example = computed(() =>
  t('settings.unit.example', { units: money(1.8, 'units'), euros: money(1.8, 'euros') }),
)
const bankrollInEuros = computed(() =>
  !bankroll.value ? null : `= ${money(bankroll.value, 'euros', false)}`,
)

/** Preset buttons: `10 €` (PT) or `€10` (EN). */
const presetLabel = computed(() => {
  const format = new Intl.NumberFormat(intlLocale.value, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  })
  return (euros: number) => format.format(euros)
})
/** `€` goes after the amount in PT-PT and before it in EN, in the unit value input too. */
const euroAffix = computed(() =>
  intlLocale.value === 'pt-PT' ? { suffix: ' €' } : { prefix: '€' },
)

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
  <div class="mx-auto flex max-w-2xl flex-col gap-4">
    <h1 class="m-0 text-[22px] font-bold tracking-tight">{{ t('settings.title') }}</h1>

    <form
      class="flex flex-col gap-6 rounded-2xl border border-eb-border bg-eb-surface p-4 sm:p-5"
      @submit.prevent="save"
    >
      <fieldset class="m-0 flex flex-col gap-3 border-0 p-0" :disabled="loading">
        <legend class="mb-1 p-0 text-[17px] font-bold">{{ t('settings.display.legend') }}</legend>
        <div
          class="grid grid-cols-2 gap-1 rounded-xl border border-eb-border bg-eb-surface-2 p-1"
          role="group"
          :aria-label="t('settings.display.legend')"
        >
          <button
            v-for="display in displays"
            :key="display"
            type="button"
            class="min-h-11 rounded-[9px] text-[15px] font-semibold transition-colors"
            :class="
              moneyDisplay === display
                ? 'bg-eb-surface text-eb-text shadow-sm'
                : 'text-eb-muted hover:text-eb-text'
            "
            :aria-pressed="moneyDisplay === display"
            @click="moneyDisplay = display"
          >
            {{ t(`settings.display.${display}`) }}
          </button>
        </div>
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
          v-bind="euroAffix"
          :min-fraction-digits="0"
          :max-fraction-digits="2"
          :min="0"
          input-class="min-h-11 w-full"
          fluid
        />
        <p class="m-0 text-sm text-eb-muted tabular-nums">{{ example }}</p>
      </fieldset>

      <fieldset class="m-0 flex flex-col gap-3 border-0 p-0" :disabled="loading">
        <legend class="mb-1 p-0 text-[17px] font-bold">{{ t('settings.bankroll.legend') }}</legend>
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
      <Message v-if="saved" severity="success">{{ t('settings.saved') }}</Message>
      <Button
        type="submit"
        :label="t('common.save')"
        :loading="saving"
        :disabled="loading"
        class="min-h-11"
      />
    </form>

    <section class="rounded-2xl border border-eb-border bg-eb-surface p-4 sm:p-5">
      <h2 class="m-0 text-[17px] font-bold">{{ t('settings.levels.title') }}</h2>
      <p class="mt-1 text-sm text-eb-muted">
        {{ t('settings.levels.help') }}
      </p>
      <div class="mt-3 overflow-x-auto">
        <table class="w-full border-collapse text-left">
          <thead>
            <tr class="border-b border-eb-border text-sm text-eb-muted">
              <th class="py-2 pr-3 font-medium">{{ t('settings.levels.level') }}</th>
              <th class="py-2 pr-3 font-medium">{{ t('settings.levels.label') }}</th>
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
              <td class="py-2.5 pr-3">{{ row.level }}</td>
              <td class="py-2.5 pr-3">{{ row.label }}</td>
              <td class="py-2.5 pr-3 text-right tabular-nums">{{ row.probability }}</td>
              <td class="py-2.5 text-right tabular-nums">{{ row.fairOdd }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section
      v-if="auth.session"
      class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-eb-border bg-eb-surface p-4 sm:p-5"
    >
      <div>
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
</template>
