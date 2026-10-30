import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import WeatherWidget from '../components/weather/WeatherWidget.vue';
import WeatherIcon from '../components/weather/WeatherIcon.vue';
import WeatherCurrentCard from '../components/weather/WeatherCurrentCard.vue';
import WeatherUpcomingCard from '../components/weather/WeatherUpcomingCard.vue';
import { useWeatherStore } from '../stores/weather.store';

describe('WeatherWidget.vue & Sub-Components (TDD & Accessibility)', () => {
  const mockWeatherData = {
    location: {
      desa: 'Manggar',
      lat: -1.2251,
      lon: 116.9438,
    },
    forecast: [
      {
        datetime: '2026-10-30 12:00:00',
        temperatureCelsius: 24,
        humidityPercent: 78,
        description: 'Berawan',
        windSpeedKmh: 15,
        windDirection: 'NW',
      },
      {
        datetime: '2026-10-30 15:00:00',
        temperatureCelsius: 23,
        humidityPercent: 80,
        description: 'Cerah Berawan',
        windSpeedKmh: 14,
        windDirection: 'W',
      },
      {
        datetime: '2026-10-30 17:00:00',
        temperatureCelsius: 22,
        humidityPercent: 82,
        description: 'Hujan Ringan',
        windSpeedKmh: 10,
        windDirection: 'SW',
      },
    ],
    fetchedAt: '2026-10-30T12:00:00.000Z',
    stale: false,
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Test 1: WeatherIcon component maps BMKG descriptions and provides fallback
  describe('WeatherIcon.vue', () => {
    it('renders vector SVG image for recognized conditions with aria-hidden="true"', () => {
      const conditions = [
        { desc: 'Cerah', expected: 'sun' },
        { desc: 'Cerah Berawan', expected: 'cloud-sun' },
        { desc: 'Berawan', expected: 'cloud' },
        { desc: 'Berawan Tebal', expected: 'cloudy' },
        { desc: 'Gerimis', expected: 'cloud-drizzle' },
        { desc: 'Hujan Sedang', expected: 'cloud-rain' },
        { desc: 'Hujan Petir', expected: 'cloud-lightning' },
        { desc: 'Kabut', expected: 'cloud-fog' },
      ];

      for (const item of conditions) {
        const wrapper = mount(WeatherIcon, {
          props: { description: item.desc },
        });

        const img = wrapper.find('[data-test="weather-icon-img"]');
        expect(img.exists()).toBe(true);
        expect(img.attributes('aria-hidden')).toBe('true');
        expect(img.attributes('src')).toContain(item.expected);
      }
    });

    it('renders accessible fallback inline SVG with aria-hidden="true" when condition is unrecognized', () => {
      const wrapper = mount(WeatherIcon, {
        props: { description: 'Kondisi Tidak Diketahui 123' },
      });

      expect(wrapper.find('[data-test="weather-icon-img"]').exists()).toBe(false);
      const fallback = wrapper.find('[data-test="weather-icon-fallback"]');
      expect(fallback.exists()).toBe(true);
      expect(fallback.attributes('aria-hidden')).toBe('true');
    });
  });

  // Test 2: WeatherCurrentCard component structure and WCAG screen-reader expansions
  describe('WeatherCurrentCard.vue', () => {
    it('renders title, "SAAT INI" badge, condition, and screen-reader unit expansions', () => {
      const entry = mockWeatherData.forecast[0]!;
      const wrapper = mount(WeatherCurrentCard, {
        props: {
          entry,
          locationName: 'Manggar',
          stale: false,
        },
      });

      // Header and badge
      const title = wrapper.find('h2#weather-widget-title');
      expect(title.exists()).toBe(true);
      expect(title.text()).toBe('Perkiraan Cuaca Manggar');
      expect(wrapper.text()).toContain('SAAT INI');

      // Temperature with screen-reader expansion
      expect(wrapper.text()).toContain('24°C');
      expect(wrapper.text()).toContain('24 derajat Celsius');

      // Metric pills with screen-reader expansions
      const humidityPill = wrapper.find('[data-test="metric-humidity"]');
      expect(humidityPill.text()).toContain('Kelembapan : 78%');
      expect(humidityPill.text()).toContain('Kelembapan udara 78 persen');

      const windSpeedPill = wrapper.find('[data-test="metric-wind-speed"]');
      expect(windSpeedPill.text()).toContain('Kecepatan Angin : 15 km/jam');
      expect(windSpeedPill.text()).toContain('Kecepatan angin 15 kilometer per jam');

      const windDirPill = wrapper.find('[data-test="metric-wind-direction"]');
      expect(windDirPill.text()).toContain('Arah Angin : Barat Laut');
      expect(windDirPill.text()).toContain('Arah angin: Barat Laut');
    });

    it('renders stale badge when stale prop is true', () => {
      const wrapper = mount(WeatherCurrentCard, {
        props: {
          entry: mockWeatherData.forecast[0]!,
          stale: true,
        },
      });

      expect(wrapper.find('[data-test="stale-badge"]').exists()).toBe(true);
    });
  });

  // Test 3: WeatherUpcomingCard component structure and time localization
  describe('WeatherUpcomingCard.vue', () => {
    it('renders hourly WITA time with screen-reader expansion and temperature', () => {
      const entry = mockWeatherData.forecast[1]!; // 15:00:00
      const wrapper = mount(WeatherUpcomingCard, {
        props: { entry },
      });

      expect(wrapper.text()).toContain('15.00 WITA');
      expect(wrapper.text()).toContain('Prakiraan cuaca pukul 15 lewat 00 Waktu Indonesia Tengah');
      expect(wrapper.text()).toContain('23°C');
      expect(wrapper.text()).toContain('23 derajat Celsius');
      expect(wrapper.text()).toContain('Cerah Berawan');
    });
  });

  // Test 4: WeatherWidget Root States (Loading, Error, Stale, Populated)
  describe('WeatherWidget.vue Root Component', () => {
    it('displays accessible skeleton with role="status" and aria-live="polite" while loading', async () => {
      let resolvePromise: (value: Response) => void;
      const pendingPromise = new Promise<Response>((resolve) => {
        resolvePromise = resolve;
      });

      globalThis.fetch = vi.fn<typeof fetch>().mockReturnValue(pendingPromise);

      const pinia = createPinia();
      setActivePinia(pinia);

      const wrapper = mount(WeatherWidget, {
        global: { plugins: [pinia] },
      });

      const skeleton = wrapper.find('[role="status"]');
      expect(skeleton.exists()).toBe(true);
      expect(skeleton.attributes('aria-live')).toBe('polite');
      expect(skeleton.attributes('aria-busy')).toBe('true');
      expect(skeleton.text()).toContain('Memuat data perkiraan cuaca...');

      // Cleanup pending promise
      resolvePromise!(
        new Response(JSON.stringify(mockWeatherData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('displays accessible error banner with role="alert" and working retry button upon failure', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ error: 'BMKG Down' }),
      } as Response);

      const pinia = createPinia();
      setActivePinia(pinia);

      const wrapper = mount(WeatherWidget, {
        global: { plugins: [pinia] },
      });

      await vi.waitUntil(() => wrapper.find('[role="alert"]').exists());

      const alert = wrapper.find('[role="alert"]');
      expect(alert.exists()).toBe(true);
      expect(alert.text()).toContain('Gagal Memuat Perkiraan Cuaca');

      const retryBtn = wrapper.find('[data-test="weather-retry-btn"]');
      expect(retryBtn.exists()).toBe(true);

      // Setup success response on retry
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockWeatherData,
      } as Response);

      await retryBtn.trigger('click');
      await vi.waitUntil(() => wrapper.find('[data-test="weather-populated-grid"]').exists());

      expect(wrapper.find('[data-test="weather-populated-grid"]').exists()).toBe(true);
    });

    it('renders stale warning banner when data is stale', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...mockWeatherData, stale: true }),
      } as Response);

      const pinia = createPinia();
      setActivePinia(pinia);

      const wrapper = mount(WeatherWidget, {
        global: { plugins: [pinia] },
      });

      await vi.waitUntil(() => wrapper.find('[data-test="weather-stale-banner"]').exists());
      expect(wrapper.find('[data-test="weather-stale-banner"]').text()).toContain(
        'mode luring',
      );
    });

    it('assembles responsive layout strictly matching Pic 1 (mobile) and Pic 2 (desktop)', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockWeatherData,
      } as Response);

      const pinia = createPinia();
      setActivePinia(pinia);
      const store = useWeatherStore(pinia);

      // Freeze time at 12:30 WITA
      store.setReferenceTime(new Date('2026-10-30T12:30:00+08:00'));

      const wrapper = mount(WeatherWidget, {
        global: { plugins: [pinia] },
      });

      await vi.waitUntil(() => wrapper.find('[data-test="weather-populated-grid"]').exists());

      // Main grid container: 1 col on mobile, 12 cols on desktop
      const grid = wrapper.find('[data-test="weather-populated-grid"]');
      expect(grid.classes()).toContain('grid-cols-1');
      expect(grid.classes()).toContain('lg:grid-cols-12');

      // Main card exists and has heading
      const currentCard = wrapper.find('[data-test="weather-current-card"]');
      expect(currentCard.exists()).toBe(true);
      expect(currentCard.find('h2#weather-widget-title').text()).toContain(
        'Perkiraan Cuaca Manggar',
      );

      // Upcoming cards container: 2 cols side-by-side on mobile, 6 cols on desktop
      const upcomingGrid = wrapper.find('[data-test="weather-upcoming-grid"]');
      expect(upcomingGrid.exists()).toBe(true);
      expect(upcomingGrid.classes()).toContain('grid-cols-2');
      expect(upcomingGrid.classes()).toContain('lg:col-span-6');

      // Both upcoming cards exist
      expect(wrapper.find('[data-test="weather-upcoming-0"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="weather-upcoming-1"]').exists()).toBe(true);
    });

    it('displays defensive empty notice when forecast array is empty', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...mockWeatherData, forecast: [] }),
      } as Response);

      const pinia = createPinia();
      setActivePinia(pinia);

      const wrapper = mount(WeatherWidget, {
        global: { plugins: [pinia] },
      });

      await vi.waitUntil(() => wrapper.find('[data-test="weather-empty-notice"]').exists());
      expect(wrapper.find('[data-test="weather-empty-notice"]').text()).toContain(
        'Data perkiraan cuaca belum tersedia',
      );
    });

    it('displays loading state on retry button without unmounting error alert while retry is in-flight', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'BMKG Down' }),
      } as Response);

      const pinia = createPinia();
      setActivePinia(pinia);

      const wrapper = mount(WeatherWidget, {
        global: { plugins: [pinia] },
      });

      await vi.waitUntil(() => wrapper.find('[role="alert"]').exists());
      const retryBtn = wrapper.find('[data-test="weather-retry-btn"]');

      let resolveRetry: (value: Response) => void;
      const retryPromise = new Promise<Response>((resolve) => {
        resolveRetry = resolve;
      });
      globalThis.fetch = vi.fn<typeof fetch>().mockReturnValue(retryPromise);

      await retryBtn.trigger('click');

      // Error alert remains mounted, button shows "Memuat..." and is disabled
      expect(wrapper.find('[role="alert"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="weather-retry-btn"]').text()).toContain('Memuat...');
      expect(wrapper.find('[data-test="weather-retry-btn"]').attributes('disabled')).toBeDefined();

      // Resolve retry
      resolveRetry!(
        new Response(JSON.stringify(mockWeatherData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await vi.waitUntil(() => wrapper.find('[data-test="weather-populated-grid"]').exists());
      expect(wrapper.find('[data-test="weather-populated-grid"]').exists()).toBe(true);
    });

    it('adapts upcoming cards container to grid-cols-1 when only 1 upcoming forecast exists', async () => {
      // Mock data with only 2 slots: current + 1 upcoming
      const singleUpcomingData = {
        ...mockWeatherData,
        forecast: [mockWeatherData.forecast[0]!, mockWeatherData.forecast[1]!],
      };

      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => singleUpcomingData,
      } as Response);

      const pinia = createPinia();
      setActivePinia(pinia);
      const store = useWeatherStore(pinia);
      store.setReferenceTime(new Date('2026-10-30T12:30:00+08:00'));

      const wrapper = mount(WeatherWidget, {
        global: { plugins: [pinia] },
      });

      await vi.waitUntil(() => wrapper.find('[data-test="weather-populated-grid"]').exists());

      const upcomingGrid = wrapper.find('[data-test="weather-upcoming-grid"]');
      expect(upcomingGrid.exists()).toBe(true);
      expect(upcomingGrid.classes()).toContain('grid-cols-1');
      expect(upcomingGrid.classes()).not.toContain('grid-cols-2');
      expect(wrapper.find('[data-test="weather-upcoming-0"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="weather-upcoming-1"]').exists()).toBe(false);
    });

    it('renders fallback screen-reader text when metrics are unavailable in WeatherCurrentCard', () => {
      const wrapper = mount(WeatherCurrentCard, {
        props: {
          entry: null,
          locationName: '',
        },
      });

      expect(wrapper.find('h2#weather-widget-title').text()).toBe('Perkiraan Cuaca Manggar');
      expect(wrapper.text()).toContain('Data suhu tidak tersedia');
      expect(wrapper.text()).toContain('Kelembapan udara tidak tersedia');
      expect(wrapper.text()).toContain('Kecepatan angin tidak tersedia');
      expect(wrapper.text()).toContain('Arah angin tidak tersedia');
      expect(wrapper.find('[data-test="metric-humidity"]').text()).toContain('Kelembapan : -');
      expect(wrapper.find('[data-test="metric-wind-speed"]').text()).toContain(
        'Kecepatan Angin : -',
      );
    });

    it('safely handles NaN and non-finite metrics in WeatherCurrentCard and WeatherUpcomingCard without rendering -°C', () => {
      const entryWithNaN: typeof mockWeatherData.forecast[0] = {
        datetime: '2026-10-30 12:00:00',
        temperatureCelsius: NaN,
        humidityPercent: NaN,
        description: 'Berawan',
        windSpeedKmh: NaN,
        windDirection: 'NW',
      };

      const currentWrapper = mount(WeatherCurrentCard, {
        props: { entry: entryWithNaN },
      });

      expect(currentWrapper.text()).not.toContain('NaN°C');
      expect(currentWrapper.text()).not.toContain('-°C');
      expect(currentWrapper.text()).toContain('Data suhu tidak tersedia');
      expect(currentWrapper.find('[data-test="metric-humidity"]').text()).toContain(
        'Kelembapan : -',
      );
      expect(currentWrapper.find('[data-test="metric-wind-speed"]').text()).toContain(
        'Kecepatan Angin : -',
      );

      const upcomingWrapper = mount(WeatherUpcomingCard, {
        props: { entry: entryWithNaN },
      });

      expect(upcomingWrapper.text()).not.toContain('NaN°C');
      expect(upcomingWrapper.text()).not.toContain('-°C');
      expect(upcomingWrapper.text()).toContain('Data suhu tidak tersedia');
    });

    it('renders fallback text when datetime is missing in WeatherUpcomingCard', () => {
      const wrapper = mount(WeatherUpcomingCard, {
        props: {
          entry: null,
        },
      });

      expect(wrapper.text()).toContain('- WITA');
      expect(wrapper.text()).toContain('Prakiraan cuaca tidak tersedia');
      expect(wrapper.text()).toContain('Data suhu tidak tersedia');
    });

    it('includes motion-reduce:animate-none on skeletons for users with reduced motion preferences', () => {
      let resolvePromise: (value: Response) => void;
      const pendingPromise = new Promise<Response>((resolve) => {
        resolvePromise = resolve;
      });
      globalThis.fetch = vi.fn<typeof fetch>().mockReturnValue(pendingPromise);

      const pinia = createPinia();
      setActivePinia(pinia);

      const wrapper = mount(WeatherWidget, {
        global: { plugins: [pinia] },
      });

      const pulseElements = wrapper.findAll('.animate-pulse');
      expect(pulseElements.length).toBeGreaterThan(0);
      for (const el of pulseElements) {
        expect(el.classes()).toContain('motion-reduce:animate-none');
      }

      resolvePromise!(
        new Response(JSON.stringify(mockWeatherData), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('surfaces refresh errors directly inside the stale banner when a reload fails', async () => {
      // 1. Initial load returns stale data
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...mockWeatherData, stale: true }),
      } as Response);

      const pinia = createPinia();
      setActivePinia(pinia);

      const wrapper = mount(WeatherWidget, {
        global: { plugins: [pinia] },
      });

      await vi.waitUntil(() => wrapper.find('[data-test="weather-stale-banner"]').exists());
      expect(wrapper.find('[data-test="weather-stale-error"]').exists()).toBe(false);

      // 2. Next fetch on reload fails with 502
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ error: 'Koneksi ke BMKG terputus' }),
      } as Response);

      const reloadBtn = wrapper.find('[data-test="weather-stale-banner"] button');
      await reloadBtn.trigger('click');

      await vi.waitUntil(() => wrapper.find('[data-test="weather-stale-error"]').exists());
      expect(wrapper.find('[data-test="weather-stale-error"]').text()).toContain(
        'Koneksi ke BMKG terputus',
      );
    });

    it('provides a functioning Muat Ulang recovery button on the empty forecast notice', async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...mockWeatherData, forecast: [] }),
      } as Response);

      const pinia = createPinia();
      setActivePinia(pinia);

      const wrapper = mount(WeatherWidget, {
        global: { plugins: [pinia] },
      });

      await vi.waitUntil(() => wrapper.find('[data-test="weather-empty-notice"]').exists());
      const emptyRetryBtn = wrapper.find('[data-test="weather-empty-retry-btn"]');
      expect(emptyRetryBtn.exists()).toBe(true);
      expect(emptyRetryBtn.text()).toContain('Muat Ulang');

      // Now mock successful response on retry
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockWeatherData,
      } as Response);

      await emptyRetryBtn.trigger('click');
      await vi.waitUntil(() => wrapper.find('[data-test="weather-populated-grid"]').exists());
      expect(wrapper.find('[data-test="weather-populated-grid"]').exists()).toBe(true);
    });

    it('binds title attribute on truncated description in WeatherUpcomingCard for desktop tooltip', () => {
      const entry = mockWeatherData.forecast[1]!;
      const wrapper = mount(WeatherUpcomingCard, {
        props: { entry },
      });

      const descEl = wrapper.find('.truncate');
      expect(descEl.exists()).toBe(true);
      expect(descEl.attributes('title')).toBe(entry.description);
    });
  });
});
