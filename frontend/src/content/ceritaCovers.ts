import bgKependudukan from '@/assets/img/landing-page/demografi_penduduk.webp';
import bgPendidikan from '@/assets/img/landing-page/pendidikan.webp';
import bgKesehatan from '@/assets/img/landing-page/kesehatan.webp';
import bgEkonomi from '@/assets/img/landing-page/ekonomi.webp';
import bgPemerintahan from '@/assets/img/landing-page/pemerintahan_kelembagaan.webp';
import bgGeografis from '@/assets/img/landing-page/geografis_tata_ruang.webp';
import bgInfrastruktur from '@/assets/img/landing-page/infrastruktur_perumahan.webp';
import bgPersampahan from '@/assets/img/landing-page/persampahan.webp';

/**
 * The one static photo per Cerita category, keyed by page slug (SPEC §8). The public home page's
 * Cerita previews use these as their backgrounds, and the admin list uses the same photo as the
 * card thumbnail. They are bundled assets: no request to the API or to media storage.
 */
export const CERITA_COVERS = {
  kependudukan: bgKependudukan,
  pendidikan: bgPendidikan,
  kesehatan: bgKesehatan,
  'ekonomi-dan-ketertiban': bgEkonomi,
  'pemerintahan-dan-kelembagaan': bgPemerintahan,
  'geografis-dan-tata-ruang': bgGeografis,
  'infrastruktur-dan-perumahan': bgInfrastruktur,
  'persampahan-dan-bank-sampah-unit': bgPersampahan,
} as const;

/** The bundled photo of a Cerita page slug, or null for a page without one. */
export function ceritaCoverFor(slug: string): string | null {
  return Object.prototype.hasOwnProperty.call(CERITA_COVERS, slug)
    ? CERITA_COVERS[slug as keyof typeof CERITA_COVERS]
    : null;
}
