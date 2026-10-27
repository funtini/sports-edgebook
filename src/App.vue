<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import Toast from 'primevue/toast'
import AppIcon, { type IconName } from '@/components/AppIcon.vue'
import LanguageFlag from '@/components/LanguageFlag.vue'
import { useLocale } from '@/composables/useLocale'
import { useTheme } from '@/composables/useTheme'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'

const auth = useAuthStore()
const showNav = computed(() => auth.session !== null || !supabase)
const { t, locale, toggleLocale } = useLocale()
const { theme, toggleTheme } = useTheme()

/** The theme button names what it switches to. */
const themeLabel = computed(() =>
  t(theme.value === 'dark' ? 'app.theme.toLight' : 'app.theme.toDark'),
)

const links: { to: { name: string }; key: string; icon: IconName }[] = [
  { to: { name: 'today' }, key: 'app.nav.today', icon: 'calendar' },
  { to: { name: 'predictions' }, key: 'app.nav.predictions', icon: 'plus-circle' },
  { to: { name: 'multiples' }, key: 'app.nav.multiples', icon: 'layers' },
  { to: { name: 'dashboard' }, key: 'app.nav.dashboard', icon: 'chart' },
]
</script>

<template>
  <div class="min-h-screen bg-eb-bg text-eb-text">
    <header class="sticky top-0 z-10 border-b border-eb-border bg-eb-surface">
      <div class="mx-auto flex h-16 max-w-6xl items-center gap-2 pr-2 pl-4 sm:gap-6 sm:px-5">
        <RouterLink
          :to="{ name: 'today' }"
          class="flex min-h-11 shrink-0 items-center gap-2 text-eb-text no-underline"
        >
          <span class="flex size-7 items-center justify-center rounded-lg bg-eb-accent">
            <AppIcon name="logo" class="size-4 text-eb-on-accent" stroke-width="2.5" />
          </span>
          <span class="text-[17px] font-bold tracking-tight">{{ t('app.brand') }}</span>
        </RouterLink>

        <!-- Desktop nav; on phones the same links live in the bottom tab bar. -->
        <nav
          v-if="showNav"
          :aria-label="t('app.mainNav')"
          class="hidden min-w-0 flex-1 items-center gap-1 sm:flex"
        >
          <RouterLink
            v-for="link in links"
            :key="link.key"
            :to="link.to"
            class="flex min-h-11 items-center rounded-xl px-3 font-medium whitespace-nowrap text-eb-muted hover:bg-eb-surface-2 hover:text-eb-text"
            exact-active-class="!bg-eb-accent-soft !text-eb-accent-text"
          >
            {{ t(link.key) }}
          </RouterLink>
        </nav>

        <!-- Right side: language and theme (also before sign-in), then settings. -->
        <div class="ml-auto flex shrink-0 items-center gap-0.5" :class="{ 'sm:ml-0': showNav }">
          <button
            type="button"
            :aria-label="t('app.language.toggle')"
            :title="t(`app.language.${locale}`)"
            class="flex size-11 items-center justify-center rounded-xl hover:bg-eb-surface-2"
            data-action="language"
            @click="toggleLocale"
          >
            <LanguageFlag :locale="locale" class="h-[15px] w-[22px] text-eb-text" />
          </button>
          <button
            type="button"
            :aria-label="themeLabel"
            :title="themeLabel"
            class="flex size-11 items-center justify-center rounded-xl text-eb-text hover:bg-eb-surface-2"
            data-action="theme"
            @click="toggleTheme"
          >
            <AppIcon :name="theme === 'dark' ? 'sun' : 'moon'" class="size-5" />
          </button>
          <RouterLink
            v-if="showNav"
            :to="{ name: 'settings' }"
            :aria-label="t('app.nav.settings')"
            :title="t('app.nav.settings')"
            class="flex size-11 items-center justify-center rounded-xl text-eb-text hover:bg-eb-surface-2"
            exact-active-class="!bg-eb-accent-soft !text-eb-accent-text"
          >
            <AppIcon name="settings" class="size-5" />
          </RouterLink>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 pt-4 pb-28 sm:px-5 sm:pt-6 sm:pb-10">
      <RouterView />
    </main>

    <nav
      v-if="showNav"
      :aria-label="t('app.mainNav')"
      class="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-eb-border bg-eb-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <RouterLink
        v-for="link in links"
        :key="link.key"
        :to="link.to"
        class="flex h-[68px] flex-col items-center justify-center gap-1 text-[11px] font-semibold text-eb-muted no-underline"
        exact-active-class="!text-eb-accent-text"
      >
        <AppIcon :name="link.icon" class="size-[22px]" />
        {{ t(link.key) }}
      </RouterLink>
    </nav>

    <Toast position="bottom-center" class="max-sm:!bottom-24" />
  </div>
</template>
