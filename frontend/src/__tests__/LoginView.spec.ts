import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import TurnstileWidget from '../components/auth/TurnstileWidget.vue'
import GoogleLoginButton from '../components/auth/GoogleLoginButton.vue'

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

/** Answers the CSRF fetch itself and hands every other request to `answer`. */
function stubFetch(answer: () => Response) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    if (String(input).includes('csrf-token')) return jsonResponse({ csrfToken: 'csrf' })
    return answer()
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function stubTurnstile() {
  const turnstile = {
    render: vi.fn<() => string>().mockReturnValue('widget-1'),
    remove: vi.fn<() => void>(),
    reset: vi.fn<() => void>(),
  }
  vi.stubGlobal('turnstile', turnstile)
  return turnstile
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: LoginView },
      { path: '/register', component: { template: '<div>register</div>' } },
      { path: '/', name: 'home', component: { template: '<div>home</div>' } },
      { path: '/setup-password', name: 'setup-password', component: { template: '<div>setup</div>' } },
      { path: '/admin/cerita', component: { template: '<div>cerita</div>' } },
    ],
  })
}

async function openLoginView(query: Record<string, string> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createTestRouter()
  await router.push({ path: '/login', query })
  await router.isReady()
  const wrapper = mount(LoginView, { global: { plugins: [pinia, router] } })
  return { wrapper, router }
}

async function submitCredentials(wrapper: ReturnType<typeof mount>) {
  await wrapper.find('input[type="email"]').setValue('user@example.com')
  await wrapper.find('input[type="password"]').setValue('secret')
  await wrapper.find('form').trigger('submit.prevent')
}

const SUCCESS_BODY = {
  user: { id: '1', email: 'user@example.com', role: 'admin' },
  accessToken: 'tok',
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('LoginView turnstile reset on failure', () => {
  it('resets the Turnstile widget after a failed login so the stale token is not reused', async () => {
    const turnstile = stubTurnstile()
    stubFetch(() => jsonResponse({ error: 'Password salah' }, 401))
    const { wrapper } = await openLoginView()

    await wrapper.find('input[type="email"]').setValue('user@example.com')
    await wrapper.find('input[type="password"]').setValue('wrong-password')
    await wrapper.findComponent(TurnstileWidget).vm.$emit('verify', 'turnstile-token')
    await wrapper.find('form').trigger('submit.prevent')
    await vi.waitFor(() => expect(turnstile.reset).toHaveBeenCalledWith('widget-1'))
  })
})

describe('LoginView redirect after login', () => {
  beforeEach(() => {
    stubTurnstile()
  })

  it('returns to a safe redirect path after login', async () => {
    stubFetch(() => jsonResponse(SUCCESS_BODY))
    const { wrapper, router } = await openLoginView({ redirect: '/admin/cerita' })

    await submitCredentials(wrapper)
    await vi.advanceTimersByTimeAsync(800)

    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/admin/cerita'))
  })

  it('ignores an unsafe redirect and goes to the default destination', async () => {
    stubFetch(() => jsonResponse(SUCCESS_BODY))
    const { wrapper, router } = await openLoginView({ redirect: '//evil.com' })

    await submitCredentials(wrapper)
    await vi.advanceTimersByTimeAsync(800)

    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/'))
  })

  it('carries the safe redirect through the first-login password step', async () => {
    stubFetch(() => jsonResponse({ status: 'REQUIRES_PASSWORD_CHANGE', setupToken: 'setup-token' }))
    const { wrapper, router } = await openLoginView({ redirect: '/admin/cerita' })

    await submitCredentials(wrapper)
    await vi.advanceTimersByTimeAsync(600)

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('setup-password'))
    expect(router.currentRoute.value.query.redirect).toBe('/admin/cerita')
  })

  it('drops an unsafe redirect on the way to the first-login password step', async () => {
    stubFetch(() => jsonResponse({ status: 'REQUIRES_PASSWORD_CHANGE', setupToken: 'setup-token' }))
    const { wrapper, router } = await openLoginView({ redirect: '/login' })

    await submitCredentials(wrapper)
    await vi.advanceTimersByTimeAsync(600)

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('setup-password'))
    expect(router.currentRoute.value.query.redirect).toBeUndefined()
  })

  it('hands the safe redirect to the Google button and drops an unsafe one', async () => {
    const safe = await openLoginView({ redirect: '/admin/cerita' })
    expect(safe.wrapper.findComponent(GoogleLoginButton).props('redirect')).toBe('/admin/cerita')

    const unsafe = await openLoginView({ redirect: 'https://evil.com' })
    expect(unsafe.wrapper.findComponent(GoogleLoginButton).props('redirect')).toBeFalsy()
  })
})

describe('LoginView reason query', () => {
  beforeEach(() => {
    stubTurnstile()
  })

  async function mountWith(path: string) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createTestRouter()
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

  it('shows the generic Google sentence for an unknown reason and never prints it', async () => {
    const wrapper = await mountWith('/login?reason=zzz_made_up')
    expect(wrapper.text()).not.toContain('zzz_made_up')
    expect(wrapper.text()).toContain('Gagal masuk dengan Google. Silakan coba lagi.')
  })
})
