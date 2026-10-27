import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'today', component: () => import('@/views/TodayView.vue') },
    {
      path: '/registo',
      name: 'predictions',
      component: () => import('@/views/PredictionsView.vue'),
      // `?evento=<id>` preselects that game, e.g. from the event screen.
      props: (route) => ({
        eventId: typeof route.query.evento === 'string' ? route.query.evento : undefined,
      }),
    },
    {
      path: '/eventos/:id',
      name: 'event',
      component: () => import('@/views/EventView.vue'),
      props: true,
    },
    { path: '/multiplas', name: 'multiples', component: () => import('@/views/MultiplesView.vue') },
    { path: '/dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue') },
    { path: '/definicoes', name: 'settings', component: () => import('@/views/SettingsView.vue') },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { public: true },
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.init()
  if (!to.meta.public && !auth.isAuthenticated) return { name: 'login' }
  if (to.name === 'login' && auth.isAuthenticated) return { name: 'today' }
})

export default router
