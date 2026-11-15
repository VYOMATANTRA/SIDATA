import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import SetupPassword from '../views/SetupPassword.vue'
import TurnstileWidget from '../components/auth/TurnstileWidget.vue'
import { useAuthStore } from '../stores/auth'

function mountSetupPassword() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const authStore = useAuthStore(pinia)
  authStore.setSetupAuth('mock-setup-token')

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/setup-password', component: SetupPassword },
      { path: '/', component: { template: '<div>home</div>' } },
    ],
  })

  window.turnstile = {
    render: vi.fn<() => string>().mockReturnValue('widget-1'),
    remove: vi.fn<() => void>(),
    reset: vi.fn<() => void>(),
  }

  return { pinia, router, authStore }
}

describe('SetupPassword.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the submit button disabled when fields are empty', async () => {
    const { pinia, router } = mountSetupPassword()
    await router.push('/setup-password')
    await router.isReady()

    const wrapper = mount(SetupPassword, { global: { plugins: [pinia, router] } })
    const button = wrapper.find('button[type="submit"]')

    expect(button.attributes('disabled')).toBeDefined()
    expect(button.classes()).toContain('bg-slate-700')
  })

  it('shows error warning when password is less than 8 characters', async () => {
    const { pinia, router } = mountSetupPassword()
    await router.push('/setup-password')
    await router.isReady()

    const wrapper = mount(SetupPassword, { global: { plugins: [pinia, router] } })
    const passwordInputs = wrapper.findAll('input[type="password"]')

    await passwordInputs[0]?.setValue('short')
    await passwordInputs[0]?.trigger('blur')

    expect(wrapper.text()).toContain('Kata sandi minimal harus 8 karakter.')

    const button = wrapper.find('button[type="submit"]')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('shows error warning when password is weak or common', async () => {
    const { pinia, router } = mountSetupPassword()
    await router.push('/setup-password')
    await router.isReady()

    const wrapper = mount(SetupPassword, { global: { plugins: [pinia, router] } })
    const passwordInputs = wrapper.findAll('input[type="password"]')

    await passwordInputs[0]?.setValue('password123')
    await passwordInputs[0]?.trigger('blur')

    expect(wrapper.text()).toContain('Kata sandi terlalu lemah atau umum digunakan.')

    const button = wrapper.find('button[type="submit"]')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('shows error warning when confirmation does not match', async () => {
    const { pinia, router } = mountSetupPassword()
    await router.push('/setup-password')
    await router.isReady()

    const wrapper = mount(SetupPassword, { global: { plugins: [pinia, router] } })
    const passwordInputs = wrapper.findAll('input[type="password"]')

    await passwordInputs[0]?.setValue('StrongPassw0rd!Zz')
    await passwordInputs[1]?.setValue('DifferentPassw0rd!Zz')
    await passwordInputs[1]?.trigger('blur')

    expect(wrapper.text()).toContain('Konfirmasi kata sandi tidak cocok')

    const button = wrapper.find('button[type="submit"]')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('redirects to /login?reason=setup_required when mounted without setupToken', async () => {
    sessionStorage.clear()
    const pinia = createPinia()
    setActivePinia(pinia)
    const authStore = useAuthStore(pinia)
    authStore.clearAuth()

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/setup-password', name: 'setup-password', component: SetupPassword },
        { path: '/login', name: 'login', component: { template: '<div>login</div>' } },
      ],
    })

    await router.push('/setup-password')
    await router.isReady()

    mount(SetupPassword, { global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.reason).toBe('setup_required')
  })
})

describe('SetupPassword return address', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.useFakeTimers()
    vi.stubGlobal('turnstile', {
      render: vi.fn<() => string>().mockReturnValue('widget-1'),
      remove: vi.fn<() => void>(),
      reset: vi.fn<() => void>(),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function createSetupRouter() {
    return createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/setup-password', name: 'setup-password', component: SetupPassword },
        { path: '/login', name: 'login', component: { template: '<div>login</div>' } },
        { path: '/', name: 'home', component: { template: '<div>home</div>' } },
        { path: '/admin/cerita', component: { template: '<div>cerita</div>' } },
      ],
    })
  }

  it('bounces a visitor without a setup token to login with the same return address', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore(pinia).clearAuth()
    const router = createSetupRouter()
    await router.push('/setup-password?redirect=/admin/cerita')
    await router.isReady()

    mount(SetupPassword, { global: { plugins: [pinia, router] } })

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
    expect(router.currentRoute.value.query).toMatchObject({
      reason: 'setup_required',
      redirect: '/admin/cerita',
    })
  })

  it.each([
    ['/admin/cerita', '/admin/cerita'],
    ['/', '//evil.com'],
  ])('after the password is set, goes to %j when the redirect is %j', async (expected, redirect) => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
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
      }),
    )
    const pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore(pinia).setSetupAuth('setup-token')
    const router = createSetupRouter()
    await router.push({ path: '/setup-password', query: { redirect } })
    await router.isReady()

    const wrapper = mount(SetupPassword, { global: { plugins: [pinia, router] } })
    const passwords = wrapper.findAll('input[type="password"]')
    await passwords[0]!.setValue('Rahasia-Kuat-2026')
    await passwords[1]!.setValue('Rahasia-Kuat-2026')
    await wrapper.findComponent(TurnstileWidget).vm.$emit('verify', 'turnstile-token')
    await wrapper.find('form').trigger('submit.prevent')

    await vi.advanceTimersByTimeAsync(1000)
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe(expected))
  })
})
