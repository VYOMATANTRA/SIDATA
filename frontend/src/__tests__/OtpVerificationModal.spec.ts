import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OtpVerificationModal from '../components/auth/OtpVerificationModal.vue'
import TurnstileWidget from '../components/auth/TurnstileWidget.vue'

describe('OtpVerificationModal paste handling', () => {
  it('clears stale digits when pasting fewer than 6 digits', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    // Mock global fetch to prevent actual network calls during test
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ csrfToken: 'test-csrf-token' }),
    } as Response)

    const wrapper = mount(OtpVerificationModal, {
      props: {
        isOpen: true,
        email: 'user@example.com',
      },
      global: {
        plugins: [pinia],
      },
    })

    // Simulate typing 6 initial digits (e.g. from a prior failed attempt)
    const inputs = wrapper.findAll('input[type="text"]')
    expect(inputs.length).toBe(6)

    for (let i = 0; i < 6; i++) {
      await inputs[i]?.setValue('1')
    }

    // Verify initial state is ["1", "1", "1", "1", "1", "1"]
    const initialValues = inputs.map((input) => (input.element as HTMLInputElement).value)
    expect(initialValues).toEqual(['1', '1', '1', '1', '1', '1'])

    const container = wrapper.find('div.flex.justify-between.gap-2')
    expect(container.exists()).toBe(true)
    await container.trigger('paste', {
      clipboardData: {
        getData: (format: string) => (format === 'text' ? '99' : ''),
      },
    })

    // Verify slots 0-1 are ["9", "9"] and slots 2-5 are cleared to ""
    const updatedValues = inputs.map((input) => (input.element as HTMLInputElement).value)
    expect(updatedValues).toEqual(['9', '9', '', '', '', ''])
  })
})

describe('OtpVerificationModal network requests', () => {
  it('sends credentials on verify-otp and resend-otp so auth cookies are attached cross-origin', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'test-csrf-token' }) } as Response
      }
      return { ok: true, json: async () => ({ accessToken: 'token' }) } as Response
    })
    globalThis.fetch = fetchMock

    const wrapper = mount(OtpVerificationModal, {
      props: { isOpen: true, email: 'user@example.com' },
      global: { plugins: [pinia] },
    })

    await wrapper.findComponent(TurnstileWidget).vm.$emit('verify', 'turnstile-token')

    const inputs = wrapper.findAll('input[type="text"]')
    for (let i = 0; i < 5; i++) {
      await inputs[i]?.setValue('1')
    }
    // Filling the last digit auto-submits via handleInput.
    await inputs[5]?.setValue('1')
    await Promise.resolve()

    const verifyCall = fetchMock.mock.calls.find(([reqInput]) => String(reqInput).includes('/api/auth/verify-otp'))
    expect(verifyCall).toBeDefined()
    expect(verifyCall?.[1]).toMatchObject({ credentials: 'include' })
  })

  it('sends credentials on resend-otp', async () => {
    vi.useFakeTimers()
    const pinia = createPinia()
    setActivePinia(pinia)

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('csrf-token')) {
        return { ok: true, json: async () => ({ csrfToken: 'test-csrf-token' }) } as Response
      }
      return { ok: true, json: async () => ({ message: 'ok' }) } as Response
    })
    globalThis.fetch = fetchMock

    const wrapper = mount(OtpVerificationModal, {
      props: { isOpen: false, email: 'user@example.com' },
      global: { plugins: [pinia] },
    })
    // Toggling isOpen triggers the watcher that starts the 60s countdown.
    await wrapper.setProps({ isOpen: true })
    vi.advanceTimersByTime(60_000)
    await wrapper.vm.$nextTick()

    await wrapper.findComponent(TurnstileWidget).vm.$emit('verify', 'turnstile-token')
    await wrapper.vm.$nextTick()

    const resendButton = wrapper
      .findAll('button')
      .find((btn) => btn.text().includes('Kirim Ulang Kode OTP'))
    expect(resendButton).toBeDefined()
    await resendButton?.trigger('click')

    const resendCall = fetchMock.mock.calls.find(([reqInput]) => String(reqInput).includes('/api/auth/resend-otp'))
    expect(resendCall).toBeDefined()
    expect(resendCall?.[1]).toMatchObject({ credentials: 'include' })

    vi.useRealTimers()
  })
})
