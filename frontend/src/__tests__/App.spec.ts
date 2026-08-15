import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import App from '../App.vue'
import router from '../router/index'

describe('App', () => {
  it('mounts renders properly', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    router.push('/login')
    await router.isReady()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
      },
    })
    expect(wrapper.exists()).toBe(true)
  })
})
