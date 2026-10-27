<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import Toast from 'primevue/toast'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'

const auth = useAuthStore()

const links = [
  { to: { name: 'today' }, label: 'Hoje' },
  { to: { name: 'predictions' }, label: 'Registo' },
  { to: { name: 'multiples' }, label: 'Múltiplas' },
  { to: { name: 'dashboard' }, label: 'Dashboard' },
  { to: { name: 'settings' }, label: 'Definições' },
]
</script>

<template>
  <div class="min-h-screen">
    <header class="border-b border-surface-200 bg-surface-0">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-7 gap-y-2 px-5 py-3">
        <RouterLink :to="{ name: 'today' }" class="text-base font-bold text-surface-900">
          Edgebook
        </RouterLink>
        <nav v-if="auth.session || !supabase" aria-label="Principal" class="flex flex-wrap gap-1">
          <RouterLink
            v-for="link in links"
            :key="link.label"
            :to="link.to"
            class="rounded-lg px-3 py-2.5 font-medium text-surface-600 hover:bg-surface-100"
            exact-active-class="!bg-primary-50 !text-primary-700"
          >
            {{ link.label }}
          </RouterLink>
        </nav>
        <button
          v-if="auth.session"
          type="button"
          class="ml-auto rounded-lg px-3 py-2.5 text-sm text-surface-600 hover:bg-surface-100"
          @click="auth.signOut()"
        >
          Sair
        </button>
      </div>
    </header>
    <main class="mx-auto max-w-6xl px-5 py-6">
      <RouterView />
    </main>
    <Toast position="bottom-center" />
  </div>
</template>
