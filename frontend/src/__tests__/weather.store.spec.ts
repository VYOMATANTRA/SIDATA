import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  useWeatherStore,
  localizeWindDirection,
  parseForecastDatetime,
  findCurrentForecastIndex,
  type WeatherForecastEntry,
} from '../stores/weather.store';
import { READ_USER_MESSAGES } from '../utils/userMessages';

describe('Weather Pinia Store & Utilities (weather.store.ts)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    vi.setSystemTime(new Date('2026-10-30T12:00:00+08:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('localizeWindDirection', () => {
    it('maps all standard compass directions to Indonesian terms', () => {
      expect(localizeWindDirection('N')).toBe('Utara');
      expect(localizeWindDirection('NE')).toBe('Timur Laut');
      expect(localizeWindDirection('E')).toBe('Timur');
      expect(localizeWindDirection('SE')).toBe('Tenggara');
      expect(localizeWindDirection('S')).toBe('Selatan');
      expect(localizeWindDirection('SW')).toBe('Barat Daya');
      expect(localizeWindDirection('W')).toBe('Barat');
      expect(localizeWindDirection('NW')).toBe('Barat Laut');
    });

    it('handles case-insensitivity and special compass codes', () => {
      expect(localizeWindDirection('nw')).toBe('Barat Laut');
      expect(localizeWindDirection('se')).toBe('Tenggara');
      expect(localizeWindDirection('NNE')).toBe('Utara Timur Laut');
      expect(localizeWindDirection('VARIABLE')).toBe('Berubah-ubah');
      expect(localizeWindDirection('CALM')).toBe('Tenang');
    });

    it('returns "-" for empty, null, or undefined inputs', () => {
      expect(localizeWindDirection(null)).toBe('-');
      expect(localizeWindDirection(undefined)).toBe('-');
      expect(localizeWindDirection('')).toBe('-');
      expect(localizeWindDirection('   ')).toBe('-');
    });

    it('preserves unrecognized strings as fallback', () => {
      expect(localizeWindDirection('CUSTOM_DIR')).toBe('CUSTOM_DIR');
    });
  });

  describe('parseForecastDatetime', () => {
    it('parses local space-separated datetime by defaulting to WITA (+08:00)', () => {
      const ms = parseForecastDatetime('2026-10-30 15:00:00');
      expect(ms).toBeGreaterThan(0);
      const isoMs = Date.parse('2026-10-30T15:00:00+08:00');
      expect(ms).toBe(isoMs);
    });

    it('parses ISO format with explicit timezone offsets', () => {
      const msWithOffset = parseForecastDatetime('2026-10-30T15:00:00+08:00');
      const msUtc = parseForecastDatetime('2026-10-30T07:00:00Z');
      expect(msWithOffset).toBe(msUtc);
    });

    it('returns 0 for empty or invalid strings', () => {
      expect(parseForecastDatetime('')).toBe(0);
      expect(parseForecastDatetime('invalid-date')).toBe(0);
      expect(parseForecastDatetime('   ')).toBe(0);
    });
  });

  describe('findCurrentForecastIndex', () => {
    const sampleForecast: WeatherForecastEntry[] = [
      {
        datetime: '2026-10-30 12:00:00',
        temperatureCelsius: 28,
        humidityPercent: 80,
        description: 'Berawan',
        windSpeedKmh: 10,
        windDirection: 'S',
      },
      {
        datetime: '2026-10-30 15:00:00',
        temperatureCelsius: 29,
        humidityPercent: 75,
        description: 'Cerah Berawan',
        windSpeedKmh: 12,
        windDirection: 'SE',
      },
      {
        datetime: '2026-10-30 18:00:00',
        temperatureCelsius: 26,
        humidityPercent: 85,
        description: 'Hujan Ringan',
        windSpeedKmh: 8,
        windDirection: 'SW',
      },
    ];

    it('returns -1 for empty forecast list', () => {
      expect(findCurrentForecastIndex([])).toBe(-1);
    });

    it('returns index 0 when current time is earlier than the first forecast slot', () => {
      const earlyTime = new Date('2026-10-30T10:00:00+08:00');
      const idx = findCurrentForecastIndex(sampleForecast, earlyTime);
      expect(idx).toBe(0);
    });

    it('returns active slot index when current time is inside a slot interval', () => {
      // 14:00 WITA is after 12:00 WITA and before 15:00 WITA -> slot 0 is active
      const midTime = new Date('2026-10-30T14:00:00+08:00');
      const idx = findCurrentForecastIndex(sampleForecast, midTime);
      expect(idx).toBe(0);

      // 15:30 WITA is after 15:00 WITA and before 18:00 WITA -> slot 1 is active
      const secondSlotTime = new Date('2026-10-30T15:30:00+08:00');
      expect(findCurrentForecastIndex(sampleForecast, secondSlotTime)).toBe(1);
    });

    it('returns last slot index when current time is past all slots but within 3 hours', () => {
      const lateTime = new Date('2026-10-30T20:00:00+08:00'); // 2 hours after 18:00
      const idx = findCurrentForecastIndex(sampleForecast, lateTime);
      expect(idx).toBe(sampleForecast.length - 1);
    });

    it('returns -1 when current time is more than 3 hours past the last slot (expired)', () => {
      const expiredTime = new Date('2026-10-30T22:00:00+08:00'); // 4 hours after 18:00
      const idx = findCurrentForecastIndex(sampleForecast, expiredTime);
      expect(idx).toBe(-1);
    });

    it('skips malformed datetime rows at beginning and selects the first valid future slot', () => {
      const forecastWithInvalid: WeatherForecastEntry[] = [
        {
          datetime: 'invalid-date',
          temperatureCelsius: 20,
          humidityPercent: 50,
          description: 'Unknown',
          windSpeedKmh: 5,
          windDirection: 'N',
        },
        {
          datetime: '2026-10-30 18:00:00',
          temperatureCelsius: 26,
          humidityPercent: 85,
          description: 'Hujan',
          windSpeedKmh: 8,
          windDirection: 'S',
        },
      ];
      // Time is before 18:00
      const early = new Date('2026-10-30T10:00:00+08:00');
      // Should pick index 1 (the first valid entry), not index 0 (corrupted)
      expect(findCurrentForecastIndex(forecastWithInvalid, early)).toBe(1);
    });

    it('returns -1 when all entries in the list have invalid timestamps', () => {
      const allInvalid: WeatherForecastEntry[] = [
        {
          datetime: 'invalid-date-1',
          temperatureCelsius: 20,
          humidityPercent: 50,
          description: 'Unknown',
          windSpeedKmh: 5,
          windDirection: 'N',
        },
        {
          datetime: '',
          temperatureCelsius: 21,
          humidityPercent: 55,
          description: 'Unknown',
          windSpeedKmh: 5,
          windDirection: 'N',
        },
      ];
      const early = new Date('2026-10-30T10:00:00+08:00');
      expect(findCurrentForecastIndex(allInvalid, early)).toBe(-1);
    });
  });

  describe('useWeatherStore Actions & Computed State', () => {
    const mockApiResponse = {
      location: {
        desa: 'Manggar',
        lat: -1.2251,
        lon: 116.9438,
      },
      forecast: [
        {
          datetime: '2026-10-30 12:00:00',
          temperatureCelsius: 28,
          humidityPercent: 80,
          description: 'Berawan',
          windSpeedKmh: 10,
          windDirection: 'S',
        },
        {
          datetime: '2026-10-30 15:00:00',
          temperatureCelsius: 29,
          humidityPercent: 75,
          description: 'Cerah Berawan',
          windSpeedKmh: 12,
          windDirection: 'SE',
        },
        {
          datetime: '2026-10-30 18:00:00',
          temperatureCelsius: 26,
          humidityPercent: 85,
          description: 'Hujan Ringan',
          windSpeedKmh: 8,
          windDirection: 'SW',
        },
        {
          datetime: '2026-10-30 21:00:00',
          temperatureCelsius: 25,
          humidityPercent: 90,
          description: 'Berawan',
          windSpeedKmh: 5,
          windDirection: 'W',
        },
      ],
      fetchedAt: '2026-10-30T12:00:00.000Z',
      stale: false,
    };

    it('successfully fetches and populates weather forecast data', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      } as Response);

      const store = useWeatherStore();
      const res = await store.fetchWeather();

      expect(res).not.toBeNull();
      expect(store.isLoaded).toBe(true);
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
      expect(store.isStale).toBe(false);
      expect(store.location?.desa).toBe('Manggar');
      expect(store.sortedForecast.length).toBe(4);
    });

    it('correctly reflects stale data status when backend returns stale: true', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...mockApiResponse, stale: true }),
      } as Response);

      const store = useWeatherStore();
      await store.fetchWeather();

      expect(store.isStale).toBe(true);
      expect(store.isLoaded).toBe(true);
    });

    it('shares a single in-flight promise across multiple concurrent fetchWeather calls', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          status: 200,
          json: async () => mockApiResponse,
        } as Response;
      });

      const store = useWeatherStore();
      const [res1, res2, res3] = await Promise.all([
        store.fetchWeather(),
        store.fetchWeather(),
        store.fetchWeather(),
      ]);

      expect(callCount).toBe(1);
      expect(res1).toBe(res2);
      expect(res2).toBe(res3);
    });

    it('avoids re-fetching when already loaded unless force=true', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          status: 200,
          json: async () => mockApiResponse,
        } as Response;
      });

      const store = useWeatherStore();
      await store.fetchWeather();
      expect(callCount).toBe(1);

      // Second call without force
      await store.fetchWeather();
      expect(callCount).toBe(1);

      // Third call with force=true
      await store.fetchWeather(true);
      expect(callCount).toBe(2);
    });

    it('handles HTTP error responses gracefully', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ error: 'Bad Gateway' }),
      } as Response);

      const store = useWeatherStore();
      const res = await store.fetchWeather();

      expect(res).toBeNull();
      expect(store.isLoading).toBe(false);
      expect(store.error).toBe(`Gagal memuat data cuaca. ${READ_USER_MESSAGES.server}`);
      expect(store.error).not.toContain('502');
    });

    it('handles network throw exceptions gracefully', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));

      const store = useWeatherStore();
      const res = await store.fetchWeather();

      expect(res).toBeNull();
      expect(store.isLoading).toBe(false);
      expect(store.error).toBe(`Gagal memuat data cuaca. ${READ_USER_MESSAGES.network}`);
    });

    it('derives currentEntry and upcomingEntries based on simulated reference time', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      } as Response);

      const store = useWeatherStore();
      await store.fetchWeather();

      // At 14:30 WITA, 12:00 slot is current, 15:00 and 18:00 are upcoming
      store.setReferenceTime(new Date('2026-10-30T14:30:00+08:00'));

      expect(store.currentEntry?.datetime).toBe('2026-10-30 12:00:00');
      expect(store.currentEntry?.temperatureCelsius).toBe(28);

      expect(store.upcomingEntries.length).toBe(2);
      expect(store.upcomingEntries[0]?.datetime).toBe('2026-10-30 15:00:00');
      expect(store.upcomingEntries[1]?.datetime).toBe('2026-10-30 18:00:00');

      // Shift to 19:00 WITA: 18:00 slot is current, 21:00 is upcoming (only 1 remaining)
      store.setReferenceTime(new Date('2026-10-30T19:00:00+08:00'));
      expect(store.currentEntry?.datetime).toBe('2026-10-30 18:00:00');
      expect(store.upcomingEntries.length).toBe(1);
      expect(store.upcomingEntries[0]?.datetime).toBe('2026-10-30 21:00:00');
    });

    it('preserves null and non-finite metrics in forecast entries without converting them to 0', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ...mockApiResponse,
          forecast: [
            {
              datetime: '2026-10-30 12:00:00',
              temperatureCelsius: null,
              humidityPercent: null,
              description: 'Berawan',
              windSpeedKmh: null,
              windDirection: 'NW',
            },
          ],
        }),
      } as Response);

      const store = useWeatherStore();
      await store.fetchWeather();

      const entry = store.sortedForecast[0];
      expect(entry?.temperatureCelsius).toBeNull();
      expect(entry?.humidityPercent).toBeNull();
      expect(entry?.windSpeedKmh).toBeNull();
    });

    it('deduplicates forecast entries that have identical timestamps', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ...mockApiResponse,
          forecast: [
            {
              datetime: '2026-10-30 12:00:00',
              temperatureCelsius: 28,
              humidityPercent: 80,
              description: 'Berawan',
              windSpeedKmh: 10,
              windDirection: 'S',
            },
            {
              datetime: '2026-10-30 12:00:00', // duplicate timestamp
              temperatureCelsius: 28,
              humidityPercent: 80,
              description: 'Berawan',
              windSpeedKmh: 10,
              windDirection: 'S',
            },
            {
              datetime: '2026-10-30 15:00:00',
              temperatureCelsius: 29,
              humidityPercent: 75,
              description: 'Cerah Berawan',
              windSpeedKmh: 12,
              windDirection: 'SE',
            },
          ],
        }),
      } as Response);

      const store = useWeatherStore();
      await store.fetchWeather();

      expect(store.sortedForecast.length).toBe(2);
      expect(store.sortedForecast[0]?.datetime).toBe('2026-10-30 12:00:00');
      expect(store.sortedForecast[1]?.datetime).toBe('2026-10-30 15:00:00');
    });

    it('exposes lastFetchedAt, locationName, and windDirectionLocalized getters', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      } as Response);

      const store = useWeatherStore();
      expect(store.lastFetchedAt).toBeNull();
      expect(store.locationName).toBe('Manggar');

      await store.fetchWeather();
      store.setReferenceTime(new Date('2026-10-30T12:30:00+08:00'));

      expect(store.lastFetchedAt).toBeInstanceOf(Date);
      expect(store.locationName).toBe('Manggar');
      expect(store.windDirectionLocalized).toBe('Selatan'); // entry 0 is 'S' -> 'Selatan'
    });

    it('shows approved wording instead of the server-provided error message', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ error: 'Gagal mengambil data cuaca dari BMKG' }),
      } as Response);

      const store = useWeatherStore();
      await store.fetchWeather();

      expect(store.error).toBe(`Gagal memuat data cuaca. ${READ_USER_MESSAGES.server}`);
      expect(store.error).not.toContain('BMKG');
      expect(store.error).not.toContain('502');
    });

    it('refreshes stale client cache when older than client cache TTL', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          status: 200,
          json: async () => mockApiResponse,
        } as Response;
      });

      const store = useWeatherStore();
      await store.fetchWeather();
      expect(callCount).toBe(1);

      // Artificially age lastFetchedAt beyond TTL (16 minutes ago)
      store.lastFetchedAt = new Date(Date.now() - 16 * 60 * 1000);

      // Now fetchWeather should refetch even without force=true
      await store.fetchWeather(false);
      expect(callCount).toBe(2);
    });

    it('discards entries with unparseable datetime so they never contaminate currentEntry or upcomingEntries', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ...mockApiResponse,
          forecast: [
            {
              datetime: 'malformed-date-string',
              temperatureCelsius: 99,
              humidityPercent: 99,
              description: 'Malformed',
              windSpeedKmh: 99,
              windDirection: 'N',
            },
            {
              datetime: '2026-10-30 15:00:00',
              temperatureCelsius: 29,
              humidityPercent: 75,
              description: 'Cerah Berawan',
              windSpeedKmh: 12,
              windDirection: 'SE',
            },
          ],
        }),
      } as Response);

      const store = useWeatherStore();
      await store.fetchWeather();

      // Malformed row is excluded completely from sortedForecast and currentEntry
      expect(store.sortedForecast.length).toBe(1);
      expect(store.sortedForecast[0]?.datetime).toBe('2026-10-30 15:00:00');
      expect(store.currentEntry?.datetime).toBe('2026-10-30 15:00:00');
      expect(store.currentEntry?.temperatureCelsius).toBe(29);
    });

    it('recalculates currentEntryIndex dynamically as currentTime updates', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      } as Response);

      const store = useWeatherStore();
      await store.fetchWeather();

      // Initially at 12:00 WITA
      store.updateCurrentTime(new Date('2026-10-30T12:00:00+08:00'));
      expect(store.currentEntry?.datetime).toBe('2026-10-30 12:00:00');

      // Fast forward live clock to 18:00 WITA
      store.updateCurrentTime(new Date('2026-10-30T18:00:00+08:00'));
      expect(store.currentEntry?.datetime).toBe('2026-10-30 18:00:00');
      expect(store.upcomingEntries[0]?.datetime).toBe('2026-10-30 21:00:00');
    });

    it('leaves coordinates as null and does not invent made-up fallback coordinates when backend omits them', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ...mockApiResponse,
          location: { desa: 'Manggar' }, // lat and lon omitted
        }),
      } as Response);

      const store = useWeatherStore();
      await store.fetchWeather();

      expect(store.location).not.toBeNull();
      expect(store.location?.desa).toBe('Manggar');
      expect(store.location?.lat).toBeNull();
      expect(store.location?.lon).toBeNull();
    });

    it('handles missing or non-object location gracefully with location: null', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ...mockApiResponse,
          location: null,
        }),
      } as Response);

      const store = useWeatherStore();
      await store.fetchWeather();

      expect(store.location).toBeNull();
      expect(store.locationName).toBe('Manggar'); // default fallback for title
    });

    it('resets currentTime and all state on resetState', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      } as Response);

      const store = useWeatherStore();
      await store.fetchWeather();

      const oldTime = 100000;
      store.updateCurrentTime(oldTime);
      expect(store.currentTime).toBe(oldTime);

      store.resetState();
      expect(store.data).toBeNull();
      expect(store.isLoaded).toBe(false);
      expect(store.currentTime).toBeGreaterThan(oldTime);
    });

    it('deduplicates entries with different datetime string formats representing the same timestamp', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ...mockApiResponse,
          forecast: [
            {
              datetime: '2026-10-30 12:00:00',
              temperatureCelsius: 28,
              humidityPercent: 80,
              description: 'Berawan',
              windSpeedKmh: 10,
              windDirection: 'S',
            },
            {
              datetime: '2026-10-30T12:00:00+08:00', // same moment, ISO format
              temperatureCelsius: 28,
              humidityPercent: 80,
              description: 'Berawan',
              windSpeedKmh: 10,
              windDirection: 'S',
            },
            {
              datetime: '2026-10-30 15:00:00',
              temperatureCelsius: 29,
              humidityPercent: 75,
              description: 'Cerah Berawan',
              windSpeedKmh: 12,
              windDirection: 'SE',
            },
          ],
        }),
      } as Response);

      const store = useWeatherStore();
      await store.fetchWeather();

      expect(store.sortedForecast.length).toBe(2);
      expect(store.sortedForecast[0]?.datetime).toBe('2026-10-30 12:00:00');
      expect(store.sortedForecast[1]?.datetime).toBe('2026-10-30 15:00:00');
    });

    it('discards in-flight fetch results when resetState is called before response arrives', async () => {
      let resolveFetch!: (res: Response) => void;
      const fetchPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });

      globalThis.fetch = vi.fn<typeof fetch>().mockReturnValue(fetchPromise);

      const store = useWeatherStore();
      const inFlightPromise = store.fetchWeather();

      expect(store.isLoading).toBe(true);

      // Reset store before fetch finishes
      store.resetState();
      expect(store.isLoaded).toBe(false);
      expect(store.data).toBeNull();

      // Now resolve the previous in-flight request
      resolveFetch({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      } as Response);

      await inFlightPromise;

      // Old in-flight fetch must NOT resurrect data or mark isLoaded as true
      expect(store.isLoaded).toBe(false);
      expect(store.data).toBeNull();
    });

    it('automatically refetches weather when live clock ticks and client cache is expired', async () => {
      let fetchCount = 0;
      globalThis.fetch = vi.fn<typeof fetch>().mockImplementation(async () => {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          json: async () => mockApiResponse,
        } as Response;
      });

      const store = useWeatherStore();
      await store.fetchWeather();
      expect(fetchCount).toBe(1);

      // Age lastFetchedAt beyond client cache TTL
      store.lastFetchedAt = new Date(Date.now() - 16 * 60 * 1000);

      // Use fake timers to advance clock interval
      vi.useFakeTimers();
      store.startLiveClock(1000);
      vi.advanceTimersByTime(1000);

      // Let tick promise resolve
      await Promise.resolve();
      expect(fetchCount).toBe(2);

      store.stopLiveClock();
      vi.useRealTimers();
    });
  });
});
