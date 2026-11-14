import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import TurnstileWidget from '../components/auth/TurnstileWidget.vue'

function mountLoginView() {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: LoginView },
      { path: '/register', component: { template: '<div>register</div>' } },
      { path: '/', component: { template: '<div>home</div>' } },
    ],
  })

  window.turnstile = {
    render: vi.fn<() => string>().mockReturnValue('widget-1'),
    remove: vi.fn<() => void>(),
    reset: vi.fn<() => void>(),
  }

  return { pinia, router }
}

describe('LoginView turnstile reset on failure', () => {
  it('resets the Turnstile widget after a failed login so the stale token is not reused', async () => {
    const { pinia, router } = mountLoginView()
    await router.push('/login')
    await router.isReady()

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
      }
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: 'Password salah' }),
      } as Response
    })

    const wrapper = mount(LoginView, { global: { plugins: [pinia, router] } })

    await wrapper.find('input[type="email"]').setValue('user@example.com')
    await wrapper.find('input[type="password"]').setValue('wrong-password')
    await wrapper.findComponent(TurnstileWidget).vm.$emit('verify', 'turnstile-token')
    await wrapper.find('form').trigger('submit.prevent')
    const resetMock = window.turnstile?.reset as ReturnType<typeof vi.fn>
    await vi.waitUntil(() => resetMock.mock.calls.length > 0)

    expect(window.turnstile?.reset).toHaveBeenCalledWith('widget-1')
  })
})

describe('LoginView redirect after login', () => {
  async function loginWith(redirect: string) {
    const { pinia, router } = mountLoginView()
    router.addRoute({ path: '/admin/cerita', component: { template: '<div>cerita</div>' } })
    await router.push({ path: '/login', query: { redirect } })
    await router.isReady()

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input).includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: { id: '1', email: 'user@example.com', role: 'admin' },
          accessToken: 'tok',
        }),
      } as Response
    })

    const wrapper = mount(LoginView, { global: { plugins: [pinia, router] } })
    await wrapper.find('input[type="email"]').setValue('user@example.com')
    await wrapper.find('input[type="password"]').setValue('secret')
    await wrapper.find('form').trigger('submit.prevent')
    return router
  }

  it('returns to a safe redirect path after login', async () => {
    const router = await loginWith('/admin/cerita')
    await vi.waitUntil(() => router.currentRoute.value.path === '/admin/cerita', { timeout: 3000 })
    expect(router.currentRoute.value.path).toBe('/admin/cerita')
  })

  it('ignores an unsafe redirect and goes to the default destination', async () => {
    const router = await loginWith('//evil.com')
    await vi.waitUntil(() => router.currentRoute.value.path === '/', { timeout: 3000 })
    expect(router.currentRoute.value.fullPath).toBe('/')  })
})

describe('LoginView reason query', () => {
  async function mountWith(path: string) {
    const { pinia, router } = mountLoginView()
    await router.push(path)
    await router.isReady()
    const wrapper = mount(LoginView, { global: { plugins: [pinia, router] } })
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('shows approved text for setup_required', async () => {
    const wrapper = await mountWith('/login?reason=setup_required')
    expect(wrapper.text()).toContain('Sesi penyiapan kata sandi tidak ditemukan')
  })

  it('shows generic Google text for a callback reason without printing the code', async () => {
    const wrapper = await mountWith('/login?reason=invalid_state')
    expect(wrapper.text()).toContain('Gagal masuk dengan Google. Silakan coba lagi.')
    expect(wrapper.text()).not.toContain('invalid_state')
  })

  it('ignores an unknown reason and never prints it', async () => {
    const wrapper = await mountWith('/login?reason=zzz_made_up')
    expect(wrapper.text()).not.toContain('zzz_made_up')
    expect(wrapper.text()).not.toContain('Gagal masuk dengan Google')
  })
})
