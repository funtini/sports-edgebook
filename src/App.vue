<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import Toast from 'primevue/toast'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'

const auth = useAuthStore()
const showNav = computed(() => auth.session !== null || !supabase)

const links = [
  { to: { name: 'today' }, label: 'Hoje' },
  { to: { name: 'predictions' }, label: 'Registo' },
  { to: { name: 'multiples' }, label: 'Múltiplas' },
  { to: { name: 'dashboard' }, label: 'Dashboard' },
]
</script>

<template>
  <div class="min-h-screen">
    <header class="border-b border-surface-200 bg-surface-0">
      <!-- One line down to 390px: the brand hides on phones (Hoje goes to the same place) and
           settings, where Sair lives, is an icon. -->
      <div class="mx-auto flex max-w-6xl items-center gap-x-7 px-4 py-3 sm:px-5">
        <RouterLink
          :to="{ name: 'today' }"
          class="text-base font-bold text-surface-900"
          :class="{ 'hidden sm:block': showNav }"
        >
          Edgebook
        </RouterLink>
        <nav v-if="showNav" aria-label="Principal" class="flex min-w-0 flex-1 items-center gap-1">
          <RouterLink
            v-for="link in links"
            :key="link.label"
            :to="link.to"
            class="rounded-lg px-2 py-3 text-sm font-medium whitespace-nowrap text-surface-600 hover:bg-surface-100 sm:px-3 sm:py-2.5 sm:text-base"
            exact-active-class="!bg-primary-50 !text-primary-700"
          >
            {{ link.label }}
          </RouterLink>
          <RouterLink
            :to="{ name: 'settings' }"
            aria-label="Definições"
            title="Definições"
            class="ml-auto flex size-11 shrink-0 items-center justify-center rounded-lg text-surface-600 hover:bg-surface-100"
            exact-active-class="!bg-primary-50 !text-primary-700"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              class="size-5"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
              />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </RouterLink>
        </nav>
      </div>
    </header>
    <main class="mx-auto max-w-6xl px-5 py-6">
      <RouterView />
    </main>
    <Toast position="bottom-center" />
  </div>
</template>
