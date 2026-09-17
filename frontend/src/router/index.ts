import { createRouter, createWebHistory } from 'vue-router'
import { getActivePinia } from 'pinia'
import { useAuthStore } from '../stores/auth'
import { useSettingsStore } from '../stores/settings.store'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
      meta: { requiresAuth: true, title: 'Beranda' },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { title: 'Masuk' },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
      meta: { title: 'Daftar' },
    },
    {
      path: '/setup-password',
      name: 'setup-password',
      component: () => import('../views/SetupPassword.vue'),
      meta: { title: 'Penyiapan Kata Sandi' },
    },
    {
      path: '/users',
      name: 'user-management',
      component: () => import('../views/UserManagement.vue'),
      meta: { requiresAuth: true, requiresAdmin: true, title: 'Manajemen Pengguna' },
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('../views/AuthCallbackView.vue'),
      meta: { title: 'Autentikasi' },
    },
  ],
})

router.beforeEach(async (to) => {
  const pinia = getActivePinia()
  if (!pinia) return

  const settingsStore = useSettingsStore(pinia)
  settingsStore.fetchPublicSettings()

  const authStore = useAuthStore(pinia)

  if (to.name === 'setup-password') {
    if (!authStore.setupToken && !authStore.mustChangePassword) {
      return { name: 'login', query: { reason: 'setup_required' } }
    }
  }

  if (!authStore.isAuthenticated && to.name !== 'setup-password' && !authStore.mustChangePassword) {
    await authStore.initAuth()
  }

  if (authStore.mustChangePassword && to.name !== 'setup-password') {
    return { name: 'setup-password' }
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login' }
  }

  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    return { name: 'home' }
  }

  if ((to.name === 'login' || to.name === 'register') && authStore.isAuthenticated) {
    return { name: 'home' }
  }
})

router.afterEach((to) => {
  const pinia = getActivePinia()
  if (!pinia) return

  const settingsStore = useSettingsStore(pinia)
  const title = typeof to.meta.title === 'string' ? to.meta.title : undefined
  settingsStore.updateDocumentTitle(title)
})

export default router

