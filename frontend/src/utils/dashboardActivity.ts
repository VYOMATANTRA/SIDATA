/**
 * Plain-Indonesian wording for the dashboard's "Perubahan terbaru" rows. The backend sends raw
 * audit actions (`indicator.updated`, `page.highlights_updated`); this module turns them into a
 * sentence an operator can read. Unknown actions fall back to a generic verb rather than the raw
 * action string, which is a diagnostic and never shown on screen.
 */

export interface DashboardActivityChange {
  action: string;
  targetType: string | null;
  targetLabel: string | null;
  actorName: string | null;
}

export interface ActivityPhrase {
  /** Verb phrase, e.g. "menambahkan". */
  verb: string;
  /** Object noun used when the audit row has no target label, e.g. "indikator". */
  noun: string;
}

export const ACTIVITY_ACTOR_FALLBACK = 'Seseorang';
const GENERIC_VERB = 'mengubah';
const GENERIC_NOUN = 'data';

/** Object noun per audit action prefix (the part before the first dot). */
const NOUN_BY_RESOURCE: Readonly<Record<string, string>> = {
  indicator: 'indikator',
  indicator_table: 'tabel indikator',
  indicator_table_row: 'baris tabel indikator',
  content_block: 'blok konten',
  page: 'halaman',
  chapter: 'bab',
  section: 'bagian',
  rt_leader: 'ketua RT',
  spatial_point: 'titik peta',
  spatial_point_rt: 'titik RT',
  comparison_template: 'templat kalimat',
};

/** Verb per audit action suffix (the part after the first dot). */
const VERB_BY_OPERATION: Readonly<Record<string, string>> = {
  created: 'menambahkan',
  updated: 'memperbarui',
  deleted: 'menghapus',
  reordered: 'mengurutkan ulang',
  duplicated: 'menduplikasi',
  moved: 'memindahkan',
  imported: 'mengimpor',
  sample_status_changed: 'memperbarui',
  text_saved: 'menyimpan teks',
  figure_saved: 'menyimpan gambar',
  figure_deleted: 'menghapus gambar',
  keyword_warning_overridden: 'mengabaikan peringatan kata kunci',
};

/** Exact-action overrides where the suffix alone reads wrong. */
const PHRASE_OVERRIDES: Readonly<Record<string, ActivityPhrase>> = {
  'page.highlights_updated': { verb: 'memperbarui statistik unggulan', noun: 'halaman' },
};

/** Verb and noun for an audit action. Unknown actions get the generic "mengubah data". */
export function activityPhrase(action: string): ActivityPhrase {
  const override = PHRASE_OVERRIDES[action];
  if (override) return override;

  const dot = action.indexOf('.');
  if (dot <= 0) return { verb: GENERIC_VERB, noun: GENERIC_NOUN };

  const resource = action.slice(0, dot);
  const operation = action.slice(dot + 1);
  const verb = VERB_BY_OPERATION[operation];
  const noun = NOUN_BY_RESOURCE[resource];
  if (!verb || !noun) return { verb: GENERIC_VERB, noun: noun ?? GENERIC_NOUN };
  return { verb, noun };
}

/**
 * The full row text: "{actor} {verb} {target}". The target is the audit row's label when present,
 * otherwise the object noun. A missing actor name (for example a deleted account) reads
 * "Seseorang".
 */
export function describeActivity(change: DashboardActivityChange): string {
  const { verb, noun } = activityPhrase(change.action);
  const actor = change.actorName?.trim() || ACTIVITY_ACTOR_FALLBACK;
  const target = change.targetLabel?.trim() || noun;
  return `${actor} ${verb} ${target}`;
}
