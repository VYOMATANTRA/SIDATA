import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import AuthCallbackView from '../views/AuthCallbackView.vue'
import { useAuthStore } from '../stores/auth'

function mountAuthCallbackView() {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/auth/callback', component: AuthCallbackView },
      { path: '/', component: { template: '<div>home</div>' } },
    ],
  })

  return { pinia, router }
}

describe('AuthCallbackView', () => {
  it('completes the silent refresh and redirects home on success', async () => {
    const { pinia, router } = mountAuthCallbackView()
    await router.push('/auth/callback')
    await router.isReady()

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
      }
      return {
        ok: true,
        json: async () => ({
          accessToken: 'token',
          user: { id: '1', email: 'user@example.com', role: 'user' },
        }),
      } as Response
    })

    const wrapper = mount(AuthCallbackView, { global: { plugins: [pinia, router] } })
    const authStore = useAuthStore(pinia)
    await vi.waitUntil(() => authStore.isAuthenticated)

    expect(wrapper.text()).not.toContain('Sesi Google tidak ditemukan')
  })

  it('shows an error and does not redirect when the session cookie is invalid/expired', async () => {
    const { pinia, router } = mountAuthCallbackView()
    await router.push('/auth/callback')
    await router.isReady()

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
      }
      return { ok: false, json: async () => ({}) } as Response
    })

    const wrapper = mount(AuthCallbackView, { global: { plugins: [pinia, router] } })
    await vi.waitUntil(() => wrapper.text().includes('Sesi Google tidak ditemukan'))

    expect(router.currentRoute.value.path).toBe('/auth/callback')
  })
})
