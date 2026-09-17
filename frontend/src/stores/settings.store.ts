import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface CoordinatesSetting {
  lat: number;
  lon: number;
  zoom: number;
}

export interface PublicSettings {
  appName: string;
  institutionName: string;
  tagline: string;
  administrativeArea: string;
  contactPhone: string;
  contactWhatsapp: string;
  contactEmail: string;
  contactAddress: string;
  defaultCoordinates: CoordinatesSetting;
  weatherAdm4: string;
}

export const DEFAULT_PUBLIC_SETTINGS: PublicSettings = {
  appName: 'SIDATA',
  institutionName: 'Kelurahan Manggar',
  tagline: 'Sistem Informasi Data Terpadu Kelurahan Manggar',
  administrativeArea: 'Kelurahan Manggar, Balikpapan Timur, Kota Balikpapan',
  contactPhone: '(0542) 746123',
  contactWhatsapp: '081234567890',
  contactEmail: 'kelurahan.manggar@balikpapan.go.id',
  contactAddress:
    'Jl. Mulawarman No. 1, Manggar, Balikpapan Timur, Kota Balikpapan, Kalimantan Timur 76116',
  defaultCoordinates: {
    lat: -1.2251,
    lon: 116.9438,
    zoom: 13,
  },
  weatherAdm4: '64.71.01.1001',
};

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<PublicSettings>({
    ...DEFAULT_PUBLIC_SETTINGS,
    defaultCoordinates: { ...DEFAULT_PUBLIC_SETTINGS.defaultCoordinates },
  });
  const isLoading = ref(false);
  const isLoaded = ref(false);
  const error = ref<string | null>(null);
  const lastPageTitle = ref<string | undefined>(undefined);

  let inFlight: Promise<PublicSettings> | null = null;

  const appName = computed(() => settings.value.appName?.trim() || DEFAULT_PUBLIC_SETTINGS.appName);
  const institutionName = computed(
    () => settings.value.institutionName?.trim() || DEFAULT_PUBLIC_SETTINGS.institutionName,
  );
  const tagline = computed(() => settings.value.tagline || DEFAULT_PUBLIC_SETTINGS.tagline);
  const administrativeArea = computed(
    () => settings.value.administrativeArea || DEFAULT_PUBLIC_SETTINGS.administrativeArea,
  );
  const defaultCoordinates = computed(
    () => settings.value.defaultCoordinates || DEFAULT_PUBLIC_SETTINGS.defaultCoordinates,
  );
  const weatherAdm4 = computed(
    () => settings.value.weatherAdm4 || DEFAULT_PUBLIC_SETTINGS.weatherAdm4,
  );
  const contactAddress = computed(
    () => settings.value.contactAddress || DEFAULT_PUBLIC_SETTINGS.contactAddress,
  );
  const contactPhone = computed(
    () => settings.value.contactPhone || DEFAULT_PUBLIC_SETTINGS.contactPhone,
  );
  const contactWhatsapp = computed(
    () => settings.value.contactWhatsapp || DEFAULT_PUBLIC_SETTINGS.contactWhatsapp,
  );
  const contactEmail = computed(
    () => settings.value.contactEmail || DEFAULT_PUBLIC_SETTINGS.contactEmail,
  );

  async function fetchPublicSettings(force = false): Promise<PublicSettings> {
    if (isLoaded.value && !force) {
      return settings.value;
    }

    if (inFlight) {
      return inFlight;
    }

    isLoading.value = true;
    error.value = null;

    inFlight = (async () => {
      try {
        const res = await fetch('/api/settings/public', {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        if (!res.ok) {
          throw new Error(`Gagal memuat pengaturan publik (HTTP ${res.status})`);
        }

        const data = await res.json();
        if (
          data &&
          typeof data === 'object' &&
          data.settings &&
          typeof data.settings === 'object' &&
          !Array.isArray(data.settings)
        ) {
          const raw = data.settings as Partial<PublicSettings>;
          const coords: Partial<CoordinatesSetting> =
            raw.defaultCoordinates &&
            typeof raw.defaultCoordinates === 'object' &&
            !Array.isArray(raw.defaultCoordinates)
              ? (raw.defaultCoordinates as Partial<CoordinatesSetting>)
              : {};

          settings.value = {
            appName: raw.appName?.trim() || DEFAULT_PUBLIC_SETTINGS.appName,
            institutionName: raw.institutionName?.trim() || DEFAULT_PUBLIC_SETTINGS.institutionName,
            tagline:
              typeof raw.tagline === 'string' ? raw.tagline : DEFAULT_PUBLIC_SETTINGS.tagline,
            administrativeArea:
              typeof raw.administrativeArea === 'string'
                ? raw.administrativeArea
                : DEFAULT_PUBLIC_SETTINGS.administrativeArea,
            contactPhone:
              typeof raw.contactPhone === 'string'
                ? raw.contactPhone
                : DEFAULT_PUBLIC_SETTINGS.contactPhone,
            contactWhatsapp:
              typeof raw.contactWhatsapp === 'string'
                ? raw.contactWhatsapp
                : DEFAULT_PUBLIC_SETTINGS.contactWhatsapp,
            contactEmail:
              typeof raw.contactEmail === 'string'
                ? raw.contactEmail
                : DEFAULT_PUBLIC_SETTINGS.contactEmail,
            contactAddress:
              typeof raw.contactAddress === 'string'
                ? raw.contactAddress
                : DEFAULT_PUBLIC_SETTINGS.contactAddress,
            defaultCoordinates: {
              lat:
                typeof coords.lat === 'number' && Number.isFinite(coords.lat)
                  ? coords.lat
                  : DEFAULT_PUBLIC_SETTINGS.defaultCoordinates.lat,
              lon:
                typeof coords.lon === 'number' && Number.isFinite(coords.lon)
                  ? coords.lon
                  : DEFAULT_PUBLIC_SETTINGS.defaultCoordinates.lon,
              zoom:
                typeof coords.zoom === 'number' && Number.isInteger(coords.zoom)
                  ? coords.zoom
                  : DEFAULT_PUBLIC_SETTINGS.defaultCoordinates.zoom,
            },
            weatherAdm4:
              typeof raw.weatherAdm4 === 'string' && raw.weatherAdm4.trim()
                ? raw.weatherAdm4.trim()
                : DEFAULT_PUBLIC_SETTINGS.weatherAdm4,
          };
          isLoaded.value = true;
          // Automatically synchronize document.title once dynamic settings are loaded
          updateDocumentTitle(lastPageTitle.value);
        }
        return settings.value;
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Gagal memuat pengaturan publik';
        // Non-blocking fallback: retain defaults
        return settings.value;
      } finally {
        isLoading.value = false;
        inFlight = null;
      }
    })();

    return inFlight;
  }

  function updateDocumentTitle(pageTitle?: string) {
    lastPageTitle.value = pageTitle;
    if (typeof document === 'undefined') return;
    const currentAppName = settings.value.appName || DEFAULT_PUBLIC_SETTINGS.appName;
    if (pageTitle) {
      document.title = `${pageTitle} | ${currentAppName}`;
    } else {
      const sub = settings.value.tagline || settings.value.institutionName;
      document.title = sub ? `${currentAppName} - ${sub}` : currentAppName;
    }
  }

  return {
    settings,
    isLoading,
    isLoaded,
    error,
    appName,
    institutionName,
    tagline,
    administrativeArea,
    defaultCoordinates,
    weatherAdm4,
    contactAddress,
    contactPhone,
    contactWhatsapp,
    contactEmail,
    fetchPublicSettings,
    updateDocumentTitle,
  };
});
