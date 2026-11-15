import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { stashPostLoginRedirect, takePostLoginRedirect } from '../utils/postLoginRedirect'

const KEY = 'sidata_post_login_redirect'

describe('postLoginRedirect', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a stashed destination once and clears it', () => {
    stashPostLoginRedirect('/admin/cerita?tab=2')

    expect(takePostLoginRedirect()).toBe('/admin/cerita?tab=2')
    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(takePostLoginRedirect()).toBeUndefined()
  })

  it('does not stash an unsafe destination and drops an earlier one', () => {
    stashPostLoginRedirect('/admin/cerita')
    stashPostLoginRedirect('https://evil.com')

    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(takePostLoginRedirect()).toBeUndefined()
  })

  it('rejects a tampered stored value that is no longer safe', () => {
    sessionStorage.setItem(KEY, '//evil.com')
    expect(takePostLoginRedirect()).toBeUndefined()
    expect(sessionStorage.getItem(KEY)).toBeNull()

    sessionStorage.setItem(KEY, '/login')
    expect(takePostLoginRedirect()).toBeUndefined()
  })

  it('treats blocked storage as "no destination" without throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(() => stashPostLoginRedirect('/admin/cerita')).not.toThrow()
    expect(takePostLoginRedirect()).toBeUndefined()
  })
})
