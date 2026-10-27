import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Session } from '@supabase/supabase-js'
import { AppError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const ready = ref(false)

  /** Without Supabase configured (local dev, tests) the app runs open. */
  const isAuthenticated = computed(() => !supabase || session.value !== null)

  async function init() {
    if (ready.value) return
    if (supabase) {
      const { data } = await supabase.auth.getSession()
      session.value = data.session
      supabase.auth.onAuthStateChange((_event, next) => {
        session.value = next
      })
    }
    ready.value = true
  }

  async function sendMagicLink(email: string) {
    if (!supabase) throw new AppError('Supabase não está configurado')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) throw error
  }

  async function signOut() {
    await supabase?.auth.signOut()
  }

  return { session, ready, isAuthenticated, init, sendMagicLink, signOut }
})
