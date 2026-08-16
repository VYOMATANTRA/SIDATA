import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import SetupPassword from '../views/SetupPassword.vue'
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
})
