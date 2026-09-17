import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore, DEFAULT_PUBLIC_SETTINGS } from '../stores/settings.store'

describe('settings store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('initializes with DEFAULT_PUBLIC_SETTINGS', () => {
    const store = useSettingsStore()

    expect(store.appName).toBe(DEFAULT_PUBLIC_SETTINGS.appName)
    expect(store.institutionName).toBe(DEFAULT_PUBLIC_SETTINGS.institutionName)
    expect(store.tagline).toBe(DEFAULT_PUBLIC_SETTINGS.tagline)
    expect(store.defaultCoordinates).toEqual(DEFAULT_PUBLIC_SETTINGS.defaultCoordinates)
    expect(store.isLoaded).toBe(false)
    expect(store.isLoading).toBe(false)
  })

  it('fetchPublicSettings retrieves and updates store settings from endpoint', async () => {
    const mockSettings = {
      appName: 'PORTAL SIDATA MANGGAR',
      institutionName: 'Kantor Kelurahan Manggar Baru',
      tagline: 'Tagline Dinamis Baru',
      administrativeArea: 'Balikpapan Timur',
      contactPhone: '081299990000',
      contactWhatsapp: '081299990000',
      contactEmail: 'admin@manggar.go.id',
      contactAddress: 'Jl. Mulawarman No. 99',
      defaultCoordinates: { lat: -1.25, lon: 116.98, zoom: 15 },
      weatherAdm4: '64.71.01.1002',
    }

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ settings: mockSettings }),
    } as Response)
    globalThis.fetch = fetchMock

    const store = useSettingsStore()
    const result = await store.fetchPublicSettings()

    expect(result.appName).toBe('PORTAL SIDATA MANGGAR')
    expect(store.appName).toBe('PORTAL SIDATA MANGGAR')
    expect(store.institutionName).toBe('Kantor Kelurahan Manggar Baru')
    expect(store.defaultCoordinates.lat).toBe(-1.25)
    expect(store.isLoaded).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/api/settings/public', expect.anything())
  })

  it('de-dupes concurrent fetchPublicSettings calls into a single HTTP request', async () => {
    let callCount = 0
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      callCount++
      return {
        ok: true,
        json: async () => ({
          settings: { appName: 'Shared Portal' },
        }),
      } as Response
    })
    globalThis.fetch = fetchMock

    const store = useSettingsStore()
    const [res1, res2] = await Promise.all([
      store.fetchPublicSettings(),
      store.fetchPublicSettings(),
    ])

    expect(res1.appName).toBe('Shared Portal')
    expect(res2.appName).toBe('Shared Portal')
    expect(callCount).toBe(1)
  })

  it('retains default settings gracefully when network fetch fails', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValue(new Error('Network error'))

    const store = useSettingsStore()
    const result = await store.fetchPublicSettings()

    expect(result.appName).toBe(DEFAULT_PUBLIC_SETTINGS.appName)
    expect(store.appName).toBe(DEFAULT_PUBLIC_SETTINGS.appName)
    expect(store.error).toBe('Network error')
    expect(store.isLoading).toBe(false)
  })

  it('updateDocumentTitle sets the document title dynamically', () => {
    const store = useSettingsStore()

    store.updateDocumentTitle('Masuk')
    expect(document.title).toBe(`Masuk | ${DEFAULT_PUBLIC_SETTINGS.appName}`)

    store.updateDocumentTitle()
    expect(document.title).toBe(
      `${DEFAULT_PUBLIC_SETTINGS.appName} - ${DEFAULT_PUBLIC_SETTINGS.tagline}`,
    )
  })

  it('automatically re-synchronizes document.title when fetchPublicSettings resolves', async () => {
    const store = useSettingsStore()
    // Simulate navigation that sets title before settings are fetched
    store.updateDocumentTitle('Pendaftaran Warga')
    expect(document.title).toBe(`Pendaftaran Warga | ${DEFAULT_PUBLIC_SETTINGS.appName}`)

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        settings: { appName: 'Kecamatan Balikpapan Timur' },
      }),
    } as Response)

    await store.fetchPublicSettings()
    // Document title should now reflect the dynamic appName
    expect(document.title).toBe('Pendaftaran Warga | Kecamatan Balikpapan Timur')
  })

  it('handles malformed, non-object, or corrupted settings payload gracefully without crashing or polluting state', async () => {
    const store = useSettingsStore()

    // Simulate API returning non-object or array settings
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        settings: 'corrupted-primitive-string',
      }),
    } as Response)

    const result = await store.fetchPublicSettings(true)
    expect(result.appName).toBe(DEFAULT_PUBLIC_SETTINGS.appName)
    expect(store.appName).toBe(DEFAULT_PUBLIC_SETTINGS.appName)
    expect(store.defaultCoordinates).toEqual(DEFAULT_PUBLIC_SETTINGS.defaultCoordinates)
  })

  it('falls back to default appName and coordinates when payload contains empty string or invalid coordinate values', async () => {
    const store = useSettingsStore()

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        settings: {
          appName: '   ',
          institutionName: '',
          defaultCoordinates: { lat: NaN, lon: Infinity, zoom: 'not-an-int' },
        },
      }),
    } as Response)

    const result = await store.fetchPublicSettings(true)
    expect(result.appName).toBe(DEFAULT_PUBLIC_SETTINGS.appName)
    expect(store.appName).toBe(DEFAULT_PUBLIC_SETTINGS.appName)
    expect(store.institutionName).toBe(DEFAULT_PUBLIC_SETTINGS.institutionName)
    expect(store.defaultCoordinates).toEqual(DEFAULT_PUBLIC_SETTINGS.defaultCoordinates)
  })
})
