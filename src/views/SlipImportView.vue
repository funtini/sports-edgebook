<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import ProgressBar from 'primevue/progressbar'
import { useToast } from 'primevue/usetoast'
import AppIcon from '@/components/AppIcon.vue'
import SlipConfirm, { type SlipContext } from '@/components/SlipConfirm.vue'
import { useLocale } from '@/composables/useLocale'
import type { SlipRead } from '@/domain/slipRead'
import { UserError, userMessage } from '@/lib/errors'
import { prepareSlipImage, SLIP_IMAGE_TYPES, type PreparedSlipImage } from '@/lib/slipImage'
import { usePredictionsStore } from '@/stores/predictions'
import { useSettingsStore } from '@/stores/settings'
import { useSlipImportStore, type ImportSaved } from '@/stores/slipImport'

/**
 * Importar aposta (docs/specs/slip-import.md, ui.md#importar): Enviar, A ler, then the
 * confirmation window. The image only lives in this screen, for the length of the import.
 */
const store = useSlipImportStore()
const predictions = usePredictionsStore()
const settings = useSettingsStore()
const router = useRouter()
const toast = useToast()
const { t, message } = useLocale()

type Stage = 'pick' | 'reading' | 'failed' | 'confirm'
const stage = ref<Stage>('pick')
const image = shallowRef<PreparedSlipImage | null>(null)
const read = shallowRef<SlipRead | null>(null)
const context = shallowRef<SlipContext | null>(null)
const bookmakers = ref<string[]>([])
const error = ref<string | null>(null)
const dragging = ref(false)

const galleryInput = ref<HTMLInputElement | null>(null)
const cameraInput = ref<HTMLInputElement | null>(null)
const ACCEPT = SLIP_IMAGE_TYPES.join(',')

function dropImage() {
  if (image.value) URL.revokeObjectURL(image.value.url)
  image.value = null
}
onBeforeUnmount(dropImage)

function reset() {
  dropImage()
  read.value = null
  context.value = null
  error.value = null
  stage.value = 'pick'
}

function chooseAnother() {
  reset()
  galleryInput.value?.click()
}

async function start(file: File | undefined) {
  if (!file) return
  reset()
  if (!(SLIP_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    error.value = 'slipImport.wrongType'
    return
  }
  stage.value = 'reading'
  try {
    image.value = await prepareSlipImage(file)
  } catch (e) {
    console.error(e)
    error.value = 'slipImport.imageFailed'
    stage.value = 'failed'
    return
  }
  await readSlip()
}

async function readSlip() {
  if (!image.value) return
  stage.value = 'reading'
  error.value = null
  try {
    const slip = await store.read(image.value.base64)
    const [loaded, used] = await Promise.all([
      store.loadContext(slip).catch((e: unknown) => {
        throw new UserError(userMessage(e, 'slipImport.loadFailed'))
      }),
      predictions.listBookmakers().catch((e: unknown) => {
        console.error(e)
        return [] as string[]
      }),
      settings.ensureLoaded(),
    ])
    read.value = slip
    context.value = loaded as SlipContext
    bookmakers.value = used
    stage.value = 'confirm'
  } catch (e) {
    error.value = userMessage(e, 'slipImport.errors.unavailable')
    stage.value = 'failed'
  }
}

function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  void start(file)
}

function onDrop(event: DragEvent) {
  dragging.value = false
  void start(event.dataTransfer?.files?.[0])
}

function cancel() {
  reset()
}

function saved(result: ImportSaved) {
  const summary = result.multiple
    ? t('slipImport.saved.multiple', { n: result.predictions })
    : t(result.upgraded ? 'slipImport.saved.upgrade' : 'slipImport.saved.single')
  toast.add({ severity: 'success', summary, life: 3000 })
  reset()
  void router.push({ name: 'today' })
}
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-4 lg:max-w-[760px]">
    <RouterLink
      :to="{ name: 'predictions' }"
      class="inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-eb-accent-text no-underline"
    >
      <AppIcon name="chevron-left" class="size-4" />
      {{ t('slipImport.back') }}
    </RouterLink>
    <h1 class="m-0 text-[22px] font-bold tracking-tight lg:text-[26px]">
      {{ t('slipImport.title') }}
    </h1>

    <input
      ref="galleryInput"
      type="file"
      :accept="ACCEPT"
      class="sr-only"
      tabindex="-1"
      aria-hidden="true"
      data-gallery-input
      @change="onFile"
    />
    <input
      ref="cameraInput"
      type="file"
      accept="image/*"
      capture="environment"
      class="sr-only"
      tabindex="-1"
      aria-hidden="true"
      data-camera-input
      @change="onFile"
    />

    <!-- Enviar -->
    <template v-if="stage === 'pick'">
      <div
        class="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors"
        :class="dragging ? 'border-eb-accent bg-eb-accent-soft' : 'border-eb-border bg-eb-surface'"
        data-drop-zone
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <AppIcon name="image" class="size-9 text-eb-muted" />
        <p class="m-0 text-base font-semibold">{{ t('slipImport.dropZone') }}</p>
        <p class="m-0 text-[13px] text-eb-muted">{{ t('slipImport.dropZoneTypes') }}</p>
        <div class="mt-1 flex w-full max-w-sm flex-col gap-2 lg:flex-row lg:justify-center">
          <Button
            type="button"
            class="min-h-12 lg:hidden"
            data-take-photo
            @click="cameraInput?.click()"
          >
            <AppIcon name="camera" class="size-4" />
            {{ t('slipImport.takePhoto') }}
          </Button>
          <Button
            type="button"
            severity="secondary"
            outlined
            class="min-h-12 lg:hidden"
            @click="galleryInput?.click()"
          >
            <AppIcon name="image" class="size-4" />
            {{ t('slipImport.fromGallery') }}
          </Button>
          <Button
            type="button"
            class="hidden min-h-12 lg:inline-flex"
            data-choose-image
            @click="galleryInput?.click()"
          >
            <AppIcon name="image" class="size-4" />
            {{ t('slipImport.chooseImage') }}
          </Button>
        </div>
      </div>
      <Message v-if="error" severity="error">{{ message(error) }}</Message>
      <p class="m-0 text-center text-[13px] text-eb-muted">{{ t('slipImport.notStored') }}</p>
    </template>

    <!-- A ler, and a failed read -->
    <section
      v-else-if="stage === 'reading' || stage === 'failed'"
      class="flex flex-col gap-3 rounded-2xl border border-eb-border bg-eb-surface p-4"
      :data-stage="stage"
    >
      <img
        v-if="image"
        :src="image.url"
        :alt="t('slipImport.slipImage')"
        class="max-h-72 self-center rounded-xl border border-eb-border object-contain"
      />
      <template v-if="stage === 'reading'">
        <p class="m-0 text-sm font-semibold" role="status">{{ t('slipImport.reading') }}</p>
        <ProgressBar mode="indeterminate" class="!h-1.5" />
      </template>
      <template v-else>
        <Message severity="error">{{ message(error ?? 'slipImport.errors.unavailable') }}</Message>
        <div class="flex flex-col gap-2 lg:flex-row">
          <Button
            v-if="image"
            type="button"
            :label="t('slipImport.retry')"
            class="min-h-12"
            data-retry
            @click="readSlip"
          />
          <Button
            type="button"
            :label="t('slipImport.otherImage')"
            severity="secondary"
            outlined
            class="min-h-12"
            data-other-image
            @click="chooseAnother"
          />
        </div>
      </template>
    </section>

    <SlipConfirm
      v-if="stage === 'confirm' && read && context && image"
      :read="read"
      :context="context"
      :image-url="image.url"
      :bookmakers="bookmakers"
      :unit-value="settings.unitValue"
      @cancel="cancel"
      @saved="saved"
    />
  </div>
</template>
