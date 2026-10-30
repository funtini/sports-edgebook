<script setup lang="ts">
import Textarea from 'primevue/textarea'
import AppIcon from './AppIcon.vue'
import { useLocale } from '@/composables/useLocale'

/** The notes text. */
const notes = defineModel<string>('notes', { required: true })
/** Whether the field shows; until then only "Adicionar notas". */
const open = defineModel<boolean>('open', { required: true })

const { t } = useLocale()
</script>

<template>
  <div class="flex flex-col gap-1">
    <button
      v-if="!open"
      type="button"
      class="flex min-h-11 items-center gap-1.5 self-start text-[15px] font-semibold text-eb-accent-text"
      @click="open = true"
    >
      <AppIcon name="plus" class="size-4" stroke-width="2.5" />
      {{ t('logging.addNotes') }}
    </button>
    <template v-else>
      <label for="notes" class="text-[13px] font-semibold text-eb-muted">{{
        t('logging.notes')
      }}</label>
      <Textarea id="notes" v-model="notes" rows="3" auto-resize class="w-full" />
    </template>
  </div>
</template>
