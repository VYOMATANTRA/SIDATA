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
