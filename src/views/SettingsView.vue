<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import Message from 'primevue/message'
import { CONFIDENCE_LABELS, CONFIDENCE_LEVELS } from '@/domain/confidence'
import { DEFAULT_UNIT_VALUE, UNIT_VALUE_PRESETS, formatDecimal, formatMoney } from '@/domain/money'
import { fairOdd } from '@/domain/value'
import { userMessage } from '@/lib/errors'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'

const store = useSettingsStore()
const auth = useAuthStore()

const unitValue = ref<number | null>(DEFAULT_UNIT_VALUE)
const bankroll = ref<number | null>(null)
const loading = ref(true)
const saving = ref(false)
const saved = ref(false)
const error = ref<string | null>(null)

const percent = new Intl.NumberFormat('pt-PT', { style: 'percent' })

const levels = computed(() =>
  CONFIDENCE_LEVELS.map((level) => {
    const probability = store.confidenceAnchors[level]
    return {
      level,
      label: CONFIDENCE_LABELS[level],
      probability: percent.format(probability),
      fairOdd: formatDecimal(fairOdd(probability)),
    }
  }),
)

const example = computed(() => formatMoney(1.8, unitValue.value ?? 0))
const bankrollInEuros = computed(() =>
  !bankroll.value ? null : formatMoney(bankroll.value, unitValue.value ?? 0, { signed: false }),
)

// The confirmation only describes what was saved; any edit makes it stale.
watch(
  [unitValue, bankroll],
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
  } catch (e) {
    error.value = userMessage(e, 'Não foi possível carregar as definições.')
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
    })
    // Shows what was stored (0 becomes empty) before confirming.
    unitValue.value = row.unit_value
    bankroll.value = row.starting_bankroll_units
    saved.value = true
  } catch (e) {
    error.value = userMessage(e, 'Não foi possível guardar as definições.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-2xl flex-col gap-5">
    <h1 class="m-0 text-2xl font-semibold">Definições</h1>

    <form
      class="flex flex-col gap-5 rounded-xl border border-surface-200 bg-surface-0 p-5"
      @submit.prevent="save"
    >
      <fieldset class="m-0 flex flex-col gap-3 border-0 p-0" :disabled="loading">
        <legend class="mb-1 p-0 text-lg font-semibold">Valor da unidade</legend>
        <p class="m-0 text-sm text-surface-600">
          Tudo é registado em unidades; o valor em euros serve só para mostrar.
        </p>
        <div class="flex flex-wrap gap-2">
          <Button
            v-for="preset in UNIT_VALUE_PRESETS"
            :key="preset"
            type="button"
            :label="`${preset} €`"
            :outlined="unitValue !== preset"
            :aria-pressed="unitValue === preset"
            class="min-h-11 min-w-16"
            @click="unitValue = preset"
          />
        </div>
        <label for="unit-value" class="text-sm font-medium">Outro valor</label>
        <InputNumber
          v-model="unitValue"
          input-id="unit-value"
          locale="pt-PT"
          suffix=" €"
          :min-fraction-digits="0"
          :max-fraction-digits="2"
          :min="0"
          input-class="min-h-11 w-full"
          fluid
        />
        <p class="m-0 text-sm text-surface-500">Exemplo: {{ example }}</p>
      </fieldset>

      <fieldset class="m-0 flex flex-col gap-3 border-0 p-0" :disabled="loading">
        <legend class="mb-1 p-0 text-lg font-semibold">Banca inicial</legend>
        <label for="bankroll" class="text-sm text-surface-600">
          Em unidades (opcional). Vazio ou 0 = sem banca inicial.
        </label>
        <InputNumber
          v-model="bankroll"
          input-id="bankroll"
          locale="pt-PT"
          suffix=" u"
          :min-fraction-digits="0"
          :max-fraction-digits="2"
          :min="0"
          input-class="min-h-11 w-full"
          fluid
        />
        <p v-if="bankrollInEuros" class="m-0 text-sm text-surface-500">{{ bankrollInEuros }}</p>
      </fieldset>

      <Message v-if="error" severity="error">{{ error }}</Message>
      <Message v-if="saved" severity="success">Definições guardadas.</Message>
      <Button
        type="submit"
        label="Guardar"
        :loading="saving"
        :disabled="loading"
        class="min-h-11"
      />
    </form>

    <section class="rounded-xl border border-surface-200 bg-surface-0 p-5">
      <h2 class="m-0 text-lg font-semibold">Níveis de confiança</h2>
      <p class="mt-1 text-sm text-surface-600">
        Probabilidade que cada nível representa. A edição chega com a calibração (Fase 4).
      </p>
      <div class="mt-3 overflow-x-auto">
        <table class="w-full border-collapse text-left">
          <thead>
            <tr class="border-b border-surface-200 text-sm text-surface-500">
              <th class="py-2 pr-3 font-medium">Nível</th>
              <th class="py-2 pr-3 font-medium">Etiqueta</th>
              <th class="py-2 pr-3 text-right font-medium">Probabilidade</th>
              <th class="py-2 text-right font-medium">Odd justa</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in levels"
              :key="row.level"
              class="border-b border-surface-100 last:border-0"
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
      class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-200 bg-surface-0 p-5"
    >
      <div>
        <h2 class="m-0 text-lg font-semibold">Conta</h2>
        <p class="mt-1 mb-0 text-sm text-surface-600">{{ auth.session.user.email }}</p>
      </div>
      <Button
        type="button"
        label="Sair"
        severity="secondary"
        outlined
        class="min-h-11"
        @click="auth.signOut()"
      />
    </section>
  </div>
</template>
