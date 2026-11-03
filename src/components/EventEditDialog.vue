<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import AppIcon from './AppIcon.vue'
import GameFields, { type GameFieldErrors } from './GameFields.vue'
import { useLocale } from '@/composables/useLocale'
import { shortDayLabel } from '@/domain/days'
import { eventEditDraftFrom, findSameGame } from '@/domain/eventEdit'
import { formatTime } from '@/domain/intl'
import { newGameFormSchema, type EventCreate, type NewGameForm } from '@/domain/schemas'
import { userMessage } from '@/lib/errors'
import { useEventsStore } from '@/stores/events'
import { useReferenceStore } from '@/stores/reference'
import type { EventWithTeams } from '@/types/db'

/**
 * "Editar evento" (docs/specs/ui.md#edit-an-event): date, time, league and teams of an event, e.g.
 * one a slip import read wrongly. When the corrected game already exists, offers to merge the two.
 * A sheet on phone, a modal from 640px. Nothing is written before "Guardar alterações".
 */
const props = defineProps<{ event: EventWithTeams }>()

const emit = defineEmits<{
  close: []
  saved: [event: EventWithTeams]
  /** This event was merged into `kept` and deleted. */
  merged: [kept: EventWithTeams]
}>()

const events = useEventsStore()
const reference = useReferenceStore()
const toast = useToast()
const { t, intlLocale, message } = useLocale()

const draft = ref<NewGameForm>(eventEditDraftFrom(props.event))
const errors = ref<GameFieldErrors>({})
const saving = ref(false)
const error = ref<string | null>(null)
/** The existing event the corrected one would duplicate; "Juntar eventos" merges into it. */
const duplicate = ref<EventWithTeams | null>(null)

// A different game in the fields is a new question.
watch(draft, () => (duplicate.value = null), { deep: true })

function kickoffLabel(event: EventWithTeams): string {
  const date = new Date(event.kickoff_at)
  return `${shortDayLabel(date, intlLocale.value)} · ${formatTime(date, intlLocale.value)}`
}

/** Teams the event had that it no longer has: removed once no event uses them. */
async function tidyTeams(stillUsed: string[]) {
  const old = [props.event.home_team.id, props.event.away_team.id]
  for (const id of old.filter((id) => !stillUsed.includes(id))) {
    // Only keeps the suggestions clean, so a failure is ignored.
    try {
      await reference.removeIfUnused(id)
    } catch (e) {
      console.error(e)
    }
  }
}

async function save() {
  error.value = null
  const result = newGameFormSchema.safeParse(draft.value)
  const found: GameFieldErrors = {}
  for (const issue of result.error?.issues ?? []) {
    found[String(issue.path[0]) as keyof NewGameForm] ??= issue.message
  }
  errors.value = found
  if (!result.success) return

  saving.value = true
  try {
    const { league: leagueName, home, away, kickoff_at } = result.data
    const league = leagueName ? await reference.ensureLeague(leagueName) : null
    const leagueId = league?.id ?? null
    const homeTeam = await reference.ensureTeam(home, leagueId)
    const awayTeam = await reference.ensureTeam(away, leagueId)
    const input: EventCreate = {
      kickoff_at,
      league_id: leagueId,
      home_team_id: homeTeam.id,
      away_team_id: awayTeam.id,
    }

    const same = findSameGame({ id: props.event.id, ...input }, await events.onDayOf(kickoff_at))
    if (same) {
      duplicate.value = same
      return
    }

    const updated = await events.update(props.event.id, input)
    await tidyTeams([updated.home_team_id, updated.away_team_id])
    toast.add({ severity: 'success', summary: t('eventEdit.saved'), life: 2500 })
    emit('saved', updated)
  } catch (e) {
    error.value = userMessage(e, 'eventEdit.saveFailed')
  } finally {
    saving.value = false
  }
}

async function merge() {
  if (!duplicate.value) return
  error.value = null
  saving.value = true
  try {
    const kept = await events.merge(props.event, duplicate.value)
    await tidyTeams([kept.home_team_id, kept.away_team_id])
    toast.add({ severity: 'success', summary: t('eventEdit.merged'), life: 2500 })
    emit('merged', kept)
  } catch (e) {
    error.value = userMessage(e, 'eventEdit.mergeFailed')
  } finally {
    saving.value = false
  }
}

function close() {
  if (!saving.value) emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

const panel = ref<HTMLElement | null>(null)
onMounted(async () => {
  document.addEventListener('keydown', onKeydown)
  panel.value?.focus()
  // Leagues and teams only feed the autocomplete, so a failure is ignored.
  if (reference.teams.length) return
  try {
    await reference.load()
  } catch (e) {
    console.error(e)
  }
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-end bg-black/50 sm:items-center sm:justify-center sm:p-6"
    data-event-edit
    @click.self="close"
  >
    <div
      ref="panel"
      class="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-eb-bg outline-none sm:max-h-[min(860px,100%)] sm:max-w-[560px] sm:rounded-2xl sm:border sm:border-eb-border sm:shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-edit-title"
      tabindex="-1"
    >
      <header
        class="flex items-start justify-between gap-3 border-b border-eb-border bg-eb-surface px-4 py-3"
      >
        <div class="min-w-0">
          <h2 id="event-edit-title" class="m-0 text-lg font-bold">
            {{ t('eventEdit.title') }}
          </h2>
          <p class="m-0 text-[15px] font-semibold break-words" data-event>
            {{ event.home_team.name }} – {{ event.away_team.name }}
          </p>
        </div>
        <button
          type="button"
          class="flex size-11 shrink-0 items-center justify-center rounded-xl text-eb-muted hover:bg-eb-surface-2"
          :aria-label="t('eventEdit.close')"
          :disabled="saving"
          @click="close"
        >
          <AppIcon name="x" class="size-5" />
        </button>
      </header>

      <form
        id="event-edit-form"
        class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
        novalidate
        @submit.prevent="save"
      >
        <p class="m-0 text-sm text-eb-muted">{{ t('eventEdit.hint') }}</p>
        <GameFields v-model="draft" :errors="errors" id-prefix="edit" />
      </form>

      <footer class="flex flex-col gap-2 border-t border-eb-border bg-eb-surface px-4 py-3">
        <Message v-if="error" severity="error">{{ message(error) }}</Message>
        <template v-if="duplicate">
          <div
            class="rounded-xl border border-eb-amber bg-eb-amber-soft px-3 py-2.5"
            role="alert"
            data-duplicate
          >
            <p class="m-0 text-sm font-bold">{{ t('eventEdit.duplicateTitle') }}</p>
            <p class="m-0 mt-1 text-[15px] font-semibold break-words">
              {{ duplicate.home_team.name }} – {{ duplicate.away_team.name }}
            </p>
            <p class="m-0 text-[13px] text-eb-muted">
              {{ kickoffLabel(duplicate)
              }}<template v-if="duplicate.league"> · {{ duplicate.league.name }}</template
              ><template v-if="duplicate.home_score != null">
                · {{ duplicate.home_score }} – {{ duplicate.away_score }}</template
              >
            </p>
            <p class="m-0 mt-1.5 text-[13px]">{{ t('eventEdit.duplicateText') }}</p>
          </div>
          <div class="flex gap-2">
            <Button
              type="button"
              :label="t('eventEdit.back')"
              severity="secondary"
              outlined
              class="min-h-12 flex-1"
              :disabled="saving"
              @click="duplicate = null"
            />
            <Button
              type="button"
              :label="t('eventEdit.merge')"
              class="min-h-12 flex-[2] !font-bold"
              :loading="saving"
              data-merge
              @click="merge"
            />
          </div>
        </template>
        <div v-else class="flex gap-2">
          <Button
            type="button"
            :label="t('eventEdit.cancel')"
            severity="secondary"
            outlined
            class="min-h-12 flex-1"
            :disabled="saving"
            @click="close"
          />
          <Button
            type="submit"
            form="event-edit-form"
            :label="t('eventEdit.save')"
            class="min-h-12 flex-[2] !font-bold"
            :loading="saving"
            data-save
          />
        </div>
      </footer>
    </div>
  </div>
</template>
