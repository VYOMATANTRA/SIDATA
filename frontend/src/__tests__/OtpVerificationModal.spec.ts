import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OtpVerificationModal from '../components/auth/OtpVerificationModal.vue'

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
