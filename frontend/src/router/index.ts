import { createRouter, createWebHistory } from 'vue-router'
import { getActivePinia } from 'pinia'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('../views/AuthCallbackView.vue'),
    },
  ],
})

router.beforeEach(async (to) => {
  const pinia = getActivePinia()
  if (!pinia) return

  const authStore = useAuthStore(pinia)

  // Gate on isAuthenticated rather than isInitialized: the latter is set permanently once
  // the first attempt completes, success or failure, so gating on it would mean a single
  // transient /api/auth/refresh failure (cold start, dropped connection) permanently disables
  // silent refresh for the rest of the tab's life even though the session cookie may still be
  // valid. initAuth() itself already short-circuits once a token is actually held, so this
  // only re-attempts while genuinely unauthenticated.
  if (!authStore.isAuthenticated) {
    await authStore.initAuth()
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login' }
  }

  if ((to.name === 'login' || to.name === 'register') && authStore.isAuthenticated) {
    return { name: 'home' }
  }
})

export default router
