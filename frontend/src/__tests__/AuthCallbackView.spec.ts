import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
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
      { path: '/admin/cerita', component: { template: '<div>cerita</div>' } },
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

describe('AuthCallbackView return address', () => {
  const KEY = 'sidata_post_login_redirect'

  beforeEach(() => {
    sessionStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function stubSuccessfulRefresh() {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        if (String(input).includes('csrf-token')) {
          return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
        }
        return {
          ok: true,
          json: async () => ({
            accessToken: 'token',
            user: { id: '1', email: 'user@example.com', role: 'admin' },
          }),
        } as Response
      }),
    )
  }

  it('returns to the saved destination after the Google round trip and clears it', async () => {
    sessionStorage.setItem(KEY, '/admin/cerita')
    stubSuccessfulRefresh()
    const { pinia, router } = mountAuthCallbackView()
    await router.push('/auth/callback')
    await router.isReady()

    const authStore = useAuthStore(pinia)
    mount(AuthCallbackView, { global: { plugins: [pinia, router] } })
    await vi.waitFor(() => expect(authStore.isAuthenticated).toBe(true))
    expect(sessionStorage.getItem(KEY)).toBeNull()

    await vi.advanceTimersByTimeAsync(600)
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/admin/cerita'))
  })

  it('falls back to home when the saved destination is unsafe', async () => {
    sessionStorage.setItem(KEY, '//evil.com')
    stubSuccessfulRefresh()
    const { pinia, router } = mountAuthCallbackView()
    await router.push('/auth/callback')
    await router.isReady()

    const authStore = useAuthStore(pinia)
    mount(AuthCallbackView, { global: { plugins: [pinia, router] } })
    await vi.waitFor(() => expect(authStore.isAuthenticated).toBe(true))

    await vi.advanceTimersByTimeAsync(600)
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/'))
  })
})
