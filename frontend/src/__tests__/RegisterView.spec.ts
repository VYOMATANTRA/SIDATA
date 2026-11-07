import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import RegisterView from '../views/RegisterView.vue'
import OtpVerificationModal from '../components/auth/OtpVerificationModal.vue'

function mountRegisterView() {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/register', component: RegisterView },
      { path: '/login', component: { template: '<div>login</div>' } },
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

async function fillAndSubmit(wrapper: ReturnType<typeof mount>) {
  await wrapper.find('input[type="email"]').setValue('new@example.com')
  const passwordInputs = wrapper.findAll('input[type="password"]')
  await passwordInputs[0]?.setValue('StrongPassw0rd!Zz')
  await passwordInputs[1]?.setValue('StrongPassw0rd!Zz')
  await wrapper.find('form').trigger('submit.prevent')
}

describe('RegisterView OTP send-failure signal', () => {
  it('surfaces the backend message and skips the cooldown when the OTP email failed to send', async () => {
    const { pinia, router } = mountRegisterView()
    await router.push('/register')
    await router.isReady()

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
      }
      return {
        ok: true,
        status: 201,
        json: async () => ({
          message:
            'Registrasi berhasil, tetapi gagal mengirim email OTP. Silakan tekan tombol kirim ulang OTP.',
          email: 'new@example.com',
          requiresOtp: true,
          otpSent: false,
        }),
      } as Response
    })

    const wrapper = mount(RegisterView, { global: { plugins: [pinia, router] } })
    await fillAndSubmit(wrapper)
    await vi.waitUntil(() => wrapper.text().includes('gagal mengirim email OTP'))

    expect(wrapper.text()).toContain('gagal mengirim email OTP')
    expect(wrapper.text()).not.toContain('Kode OTP verifikasi telah dikirim ke email Anda!')

    const modal = wrapper.findComponent(OtpVerificationModal)
    expect(modal.props('skipInitialCooldown')).toBe(true)
  })

  it('surfaces the backend success message and applies the normal cooldown on a successful send', async () => {
    const { pinia, router } = mountRegisterView()
    await router.push('/register')
    await router.isReady()

    globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'csrf' }) } as Response
      }
      return {
        ok: true,
        status: 201,
        json: async () => ({
          message: 'Registrasi berhasil. Kode OTP verifikasi telah dikirim ke email Anda.',
          email: 'new@example.com',
          requiresOtp: true,
          otpSent: true,
        }),
      } as Response
    })

    const wrapper = mount(RegisterView, { global: { plugins: [pinia, router] } })
    await fillAndSubmit(wrapper)
    await vi.waitUntil(() =>
      wrapper.text().includes('Registrasi berhasil. Kode OTP verifikasi telah dikirim ke email Anda.'),
    )

    expect(wrapper.text()).toContain('Registrasi berhasil. Kode OTP verifikasi telah dikirim ke email Anda.')

    const modal = wrapper.findComponent(OtpVerificationModal)
    expect(modal.props('skipInitialCooldown')).toBe(false)
  })
})
