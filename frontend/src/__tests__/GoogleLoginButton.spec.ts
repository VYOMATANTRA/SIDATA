import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import GoogleLoginButton from '../components/auth/GoogleLoginButton.vue'

const KEY = 'sidata_post_login_redirect'

/** Replaces window.location so the button's navigation can be read back without leaving jsdom. */
function stubLocation() {
  const location = { href: 'http://localhost/login' }
  vi.stubGlobal('location', location)
  return location
}

describe('GoogleLoginButton', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('saves the safe destination and then leaves for Google', async () => {
    const location = stubLocation()
    const wrapper = mount(GoogleLoginButton, { props: { redirect: '/admin/cerita' } })

    await wrapper.trigger('click')

    expect(sessionStorage.getItem(KEY)).toBe('/admin/cerita')
    expect(location.href).toBe('/api/auth/google')
  })

  it('clears an earlier destination when the page has none to carry', async () => {
    sessionStorage.setItem(KEY, '/admin/publikasi')
    const location = stubLocation()
    const wrapper = mount(GoogleLoginButton)

    await wrapper.trigger('click')

    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(location.href).toBe('/api/auth/google')
  })

  it('does not save an unsafe destination', async () => {
    const location = stubLocation()
    const wrapper = mount(GoogleLoginButton, { props: { redirect: '//evil.com' } })

    await wrapper.trigger('click')

    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(location.href).toBe('/api/auth/google')
  })

  it('still leaves for Google when session storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    const location = stubLocation()
    const wrapper = mount(GoogleLoginButton, { props: { redirect: '/admin/cerita' } })

    await wrapper.trigger('click')

    expect(location.href).toBe('/api/auth/google')
  })
})
