<script setup lang="ts">
import { computed } from 'vue'
import { useLocale } from '@/composables/useLocale'
import type { DraftLeg } from '@/composables/useMultipleDraft'
import type { ConfidenceLevel } from '@/domain/confidence'
import { formatTime } from '@/domain/intl'
import { OVER_UNDER_MARK } from '@/domain/markets'
import { formatDecimal } from '@/domain/money'
import AppIcon from './AppIcon.vue'
import ConfidenceBadge from './ConfidenceBadge.vue'
import ValuePill from './ValuePill.vue'

/** One leg of the multiple being built: the game, the bet, and pin / swap / remove. */
const props = defineProps<{
  leg: DraftLeg
  /** Just added by the generator: highlighted until the next change. */
  fresh?: boolean
}>()

defineEmits<{ pin: []; swap: []; remove: [] }>()

const { t, intlLocale, betParts, betSelection } = useLocale()

const prediction = computed(() => props.leg.prediction)
const event = computed(() => prediction.value.event)
const game = computed(() => `${event.value.home_team.name} – ${event.value.away_team.name}`)
const market = computed(() => betParts(prediction.value).slice(0, 3).join(' - '))
const selection = computed(() => betSelection(prediction.value))

const iconButton =
  'flex size-11 shrink-0 items-center justify-center rounded-xl border transition-colors'
</script>

<template>
  <div
    class="border-l-[3px] px-3.5 py-3 tabular-nums"
    :class="[
      leg.pinned ? 'border-l-eb-accent' : 'border-l-transparent',
      fresh ? 'bg-eb-accent-soft' : 'bg-eb-surface',
    ]"
    :data-leg="prediction.id"
    :data-fresh="fresh || undefined"
  >
    <div class="flex items-center gap-2 text-xs text-eb-muted">
      <span class="min-w-0 flex-1 truncate">
        <span class="font-semibold text-eb-text">{{
          formatTime(new Date(event.kickoff_at), intlLocale)
        }}</span>
        · {{ game
        }}<span v-if="event.league" class="hidden lg:inline"> · {{ event.league.name }}</span>
      </span>
      <span
        class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold"
        :class="
          leg.origin === 'manual' ? 'bg-eb-info-soft text-eb-info' : 'bg-eb-surface-2 text-eb-text'
        "
        data-origin
        >{{ t(`multiples.leg.${leg.origin}`) }}</span
      >
    </div>

    <div class="mt-1.5 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="text-xs text-eb-muted">{{ market }}</div>
        <div class="text-[15px] font-semibold break-words">
          <template v-if="selection.side">{{ selection.side }} </template>
          <template v-if="selection.overUnder">
            <span
              class="mr-0.5 inline-grid h-5 min-w-5 place-items-center rounded-md px-1 align-[1px] text-xs font-extrabold"
              :class="
                selection.overUnder === 'over'
                  ? 'bg-eb-accent-soft text-eb-accent-text'
                  : 'bg-eb-surface-2 text-eb-text'
              "
              aria-hidden="true"
              >{{ OVER_UNDER_MARK[selection.overUnder] }}</span
            ><span class="sr-only">{{ t(`catalogue.overUnder.${selection.overUnder}`) }}</span>
          </template>
          {{ selection.line }}
        </div>
      </div>
      <div class="text-lg font-bold">
        <span class="sr-only">{{ `${t('predictionRow.odd')} ` }}</span
        >{{ formatDecimal(prediction.odd, intlLocale) }}
      </div>
    </div>

    <div class="mt-2 flex items-center gap-2">
      <ConfidenceBadge :level="prediction.confidence as ConfidenceLevel" />
      <ValuePill :probability="prediction.probability" :odd="prediction.odd" />
      <span class="flex-1" />
      <button
        type="button"
        :class="[
          iconButton,
          leg.pinned
            ? 'border-eb-accent bg-eb-accent-soft text-eb-accent-text'
            : 'border-eb-border bg-transparent text-eb-muted hover:bg-eb-surface-2',
        ]"
        :aria-pressed="leg.pinned"
        :aria-label="t('multiples.leg.pin', { name: game })"
        :title="t('multiples.leg.pin', { name: game })"
        data-action="pin"
        @click="$emit('pin')"
      >
        <AppIcon :name="leg.pinned ? 'lock' : 'unlock'" class="size-[18px]" />
      </button>
      <button
        type="button"
        :class="[iconButton, 'border-eb-border text-eb-muted hover:bg-eb-surface-2']"
        :aria-label="t('multiples.leg.swap', { name: game })"
        :title="t('multiples.leg.swap', { name: game })"
        data-action="swap"
        @click="$emit('swap')"
      >
        <AppIcon name="swap" class="size-[18px]" />
      </button>
      <button
        type="button"
        :class="[
          iconButton,
          'border-eb-border text-eb-muted hover:bg-eb-neg-soft hover:text-eb-neg',
        ]"
        :aria-label="t('multiples.leg.remove', { name: game })"
        :title="t('multiples.leg.remove', { name: game })"
        data-action="remove"
        @click="$emit('remove')"
      >
        <AppIcon name="x" class="size-[18px]" />
      </button>
    </div>
  </div>
</template>
