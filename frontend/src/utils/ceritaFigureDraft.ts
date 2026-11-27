import { hasHtmlTag, hasUnsafeCharacters } from './titleTextRules';
import { isSexOnlyChartType } from './ceritaChart';
import type { ChartType } from '../types/ceritaArticle';
import {
  FIGURE_LIMITS,
  type FigurePhotoInput,
  type SectionFigure,
} from '../services/ceritaFigure.service';

/**
 * The editor's working copy of a section figure, and the one place that turns it into the stored
 * shape (or into plain-Indonesian problems). Nothing here names a field or an API term.
 *
 * The editor offers four tiles (the design's "Jenis figur"); they map onto the stored kinds like
 * this (SPEC §8):
 * - `photo` (1 gambar) → `photo`, exactly one photo;
 * - `photos-2` (2 gambar) → `photos`, exactly two photos;
 * - `gallery` (Galeri) → `photos`, three to twelve photos;
 * - `chart` (Grafik) → `chart` from a table of the Data menu, or, when the operator chooses
 *   "Unggah gambar grafik", the uploaded `diagram` (picture and/or bars).
 * Each kind keeps its own draft while the editor is open, so moving between tiles does not lose
 * what was typed (the two photo tiles share one group of photo rows, see `photoGroupOf`).
 */

export type FigureKind = 'photo' | 'photos' | 'diagram' | 'chart';
export type FigureTile = 'photo' | 'photos-2' | 'gallery' | 'chart';
export type GrafikSource = 'table' | 'upload';
export type ChartTypeChoice = ChartType;
export type ChartSeriesChoice = 'total' | 'by_sex';

export interface PhotoFields {
  /** Asset id once a photo is uploaded; null while the slot is empty. */
  mediaId: string | null;
  alt: string;
  caption: string;
  credit: string;
}

export interface BarFields {
  label: string;
  /** Typed text; parsed (comma decimals allowed) only when saving. */
  value: string;
}

export interface FigureDraft {
  /** The tile chosen; null while no figure kind is picked. */
  tile: FigureTile | null;
  /** Only for the Grafik tile: a table of the Data menu, or an uploaded chart picture. */
  grafikSource: GrafikSource;
  photos: PhotoFields[];
  /** Shared credit for the photo groups (2 gambar and Galeri); ignored for "1 gambar". */
  sharedCredit: string;
  diagramTitle: string;
  diagramSource: string;
  diagramImageId: string | null;
  diagramImageAlt: string;
  barUnit: string;
  bars: BarFields[];
  chartTableId: string;
  chartType: ChartTypeChoice;
  chartSeries: ChartSeriesChoice;
  chartTitle: string;
  chartSource: string;
}

export interface FigureProblem {
  fieldId: string;
  message: string;
}

/** A table of the page the chart may read: its id and whether it can be split by sex. */
export interface ChartTableOption {
  id: string;
  sexSplit: boolean;
}

/** Galeri needs at least this many photos (2 gambar uses exactly two). */
export const GALLERY_PHOTOS_MIN = 3;

export const TILE_ORDER: readonly FigureTile[] = ['photo', 'photos-2', 'gallery', 'chart'];

export const TILE_LABELS: Readonly<Record<FigureTile, { title: string; description: string }>> = {
  photo: { title: '1 gambar', description: 'Satu foto' },
  'photos-2': { title: '2 gambar', description: 'Bertumpuk' },
  gallery: { title: 'Galeri', description: '3+ foto, korsel' },
  chart: { title: 'Grafik', description: 'Dari menu Data' },
};

export const CHART_TYPE_LABELS: Readonly<Record<ChartTypeChoice, string>> = {
  bar: 'Batang',
  column: 'Kolom',
  pyramid: 'Piramida',
  donut: 'Donat',
  stacked: 'Bertumpuk',
  percent: 'Persentase',
};

export const CHART_SERIES_LABELS: Readonly<Record<ChartSeriesChoice, string>> = {
  total: 'Jumlah total',
  by_sex: 'Menurut jenis kelamin',
};

export function emptyPhoto(): PhotoFields {
  return { mediaId: null, alt: '', caption: '', credit: '' };
}

export function emptyBar(): BarFields {
  return { label: '', value: '' };
}

export function emptyDraft(): FigureDraft {
  return {
    tile: null,
    grafikSource: 'table',
    photos: [],
    sharedCredit: '',
    diagramTitle: '',
    diagramSource: '',
    diagramImageId: null,
    diagramImageAlt: '',
    barUnit: '',
    bars: [],
    chartTableId: '',
    chartType: 'bar',
    chartSeries: 'total',
    chartTitle: '',
    chartSource: '',
  };
}

/** The stored kind a tile saves as. */
export function kindForTile(tile: FigureTile, source: GrafikSource): FigureKind {
  if (tile === 'photo') return 'photo';
  if (tile === 'chart') return source === 'table' ? 'chart' : 'diagram';
  return 'photos';
}

/** The stored kind of a draft, or null while no tile is chosen. */
export function kindOfDraft(draft: FigureDraft): FigureKind | null {
  return draft.tile === null ? null : kindForTile(draft.tile, draft.grafikSource);
}

/**
 * The tile a stored figure shows as: photo count decides between "1 gambar", "2 gambar" and
 * "Galeri"; a diagram is an uploaded chart picture, a chart reads a table. Null for no figure.
 */
export function tileOfFigure(
  figure: SectionFigure | null,
): { tile: FigureTile; grafikSource: GrafikSource } | null {
  if (!figure) return null;
  if (figure.kind === 'photo') return { tile: 'photo', grafikSource: 'table' };
  if (figure.kind === 'photos') {
    return {
      tile: figure.photos.length === 2 ? 'photos-2' : 'gallery',
      grafikSource: 'table',
    };
  }
  if (figure.kind === 'diagram') return { tile: 'chart', grafikSource: 'upload' };
  return { tile: 'chart', grafikSource: 'table' };
}

/**
 * The photo rows a tile edits: "1 gambar" has its own rows, "2 gambar" and "Galeri" share one
 * group (they store the same kind). Null for the tiles without photos.
 */
export function photoGroupOf(tile: FigureTile | null): 'photo' | 'photos' | null {
  if (tile === 'photo') return 'photo';
  if (tile === 'photos-2' || tile === 'gallery') return 'photos';
  return null;
}

/**
 * A number the way an Indonesian editor writes it: dot for thousands, comma for the decimal mark
 * ("1.234,5"). `parseBarValue` reads exactly this, so what the form shows can be saved unchanged.
 */
export function formatBarValue(value: number): string {
  const english = value.toLocaleString('en-US', { maximumFractionDigits: 20, useGrouping: true });
  return english.replace(/[,.]/g, (mark) => (mark === ',' ? '.' : ','));
}

export function draftFromFigure(figure: SectionFigure | null): FigureDraft {
  const draft = emptyDraft();
  if (!figure) return draft;

  const placement = tileOfFigure(figure);
  if (!placement) return draft;
  draft.tile = placement.tile;
  draft.grafikSource = placement.grafikSource;

  if (figure.kind === 'photo' || figure.kind === 'photos') {
    draft.photos = figure.photos.map((photo) => ({
      mediaId: photo.mediaId,
      alt: photo.alt,
      caption: photo.caption ?? '',
      credit: photo.credit ?? '',
    }));
    draft.sharedCredit = figure.kind === 'photos' ? (figure.credit ?? '') : '';
    return draft;
  }

  if (figure.kind === 'chart') {
    draft.chartTableId = figure.tableId;
    draft.chartType = figure.chartType;
    draft.chartSeries = figure.series;
    draft.chartTitle = figure.title;
    draft.chartSource = figure.source ?? '';
    return draft;
  }

  draft.diagramTitle = figure.title;
  draft.diagramSource = figure.source ?? '';
  draft.diagramImageId = figure.image?.mediaId ?? null;
  draft.diagramImageAlt = figure.image?.alt ?? '';
  draft.barUnit = figure.bars?.unit ?? '';
  draft.bars = (figure.bars?.items ?? []).map((item) => ({
    label: item.label,
    value: formatBarValue(item.value),
  }));
  return draft;
}

/** True when a photo slot holds nothing the editor would keep. */
export function isBlankPhoto(photo: PhotoFields): boolean {
  return (
    !photo.mediaId &&
    photo.alt.trim() === '' &&
    photo.caption.trim() === '' &&
    photo.credit.trim() === ''
  );
}

function isBlankBar(bar: BarFields): boolean {
  return bar.label.trim() === '' && bar.value.trim() === '';
}

/**
 * What the figure editor would store, as a string, so "has the draft changed?" is a plain
 * comparison. Only real content counts:
 * - slots that hold nothing (an empty photo row, a bar row nobody typed in) are ignored;
 * - "2 gambar" and "Galeri" with the same photos store the same figure, so switching between them
 *   is not an edit;
 * - a figure with nothing in it is `none`, whatever tile is chosen;
 * - parts of a kind that is not chosen do not count.
 */
export function draftSignature(draft: FigureDraft): string {
  const kind = kindOfDraft(draft);
  if (kind === null) return 'none';

  if (kind === 'chart') {
    const title = draft.chartTitle.trim();
    const source = draft.chartSource.trim();
    if (draft.chartTableId === '' && title === '' && source === '') return 'none';
    return JSON.stringify([
      'chart',
      draft.chartTableId,
      draft.chartType,
      draft.chartSeries,
      title,
      source,
    ]);
  }

  if (kind === 'diagram') {
    const bars = draft.bars.filter((bar) => !isBlankBar(bar));
    // The description belongs to the image: once the image is gone it is not part of the draft.
    const imageAlt = draft.diagramImageId ? draft.diagramImageAlt : '';
    const empty =
      draft.diagramTitle.trim() === '' &&
      draft.diagramSource.trim() === '' &&
      draft.diagramImageId === null &&
      imageAlt.trim() === '' &&
      draft.barUnit.trim() === '' &&
      bars.length === 0;
    if (empty) return 'none';
    return JSON.stringify([
      'diagram',
      draft.diagramTitle,
      draft.diagramSource,
      draft.diagramImageId,
      imageAlt,
      draft.barUnit,
      bars.map((bar) => [bar.label, bar.value]),
    ]);
  }

  const photos = (draft.tile === 'photo' ? draft.photos.slice(0, 1) : draft.photos).filter(
    (photo) => !isBlankPhoto(photo),
  );
  if (photos.length === 0) return 'none';
  return JSON.stringify([
    'photos',
    draft.tile === 'photo' ? '' : draft.sharedCredit.trim(),
    photos.map((photo) => [photo.mediaId, photo.alt, photo.caption, photo.credit]),
  ]);
}

// --- Ids (so an error summary can focus a field) ---

export interface FigureIds {
  /** The first tile: where an error about the missing kind sends focus. */
  kind: string;
  tile: (tile: FigureTile) => string;
  grafikSource: (source: GrafikSource) => string;
  photoFile: (index: number) => string;
  photoAlt: (index: number) => string;
  photoCaption: (index: number) => string;
  photoCredit: (index: number) => string;
  photoRemove: (index: number) => string;
  swapPhotos: string;
  addPhoto: string;
  photosGroup: string;
  sharedCredit: string;
  diagramTitle: string;
  diagramSource: string;
  diagramImage: string;
  diagramImageAlt: string;
  barsGroup: string;
  barUnit: string;
  barLabel: (index: number) => string;
  barValue: (index: number) => string;
  barRemove: (index: number) => string;
  addBar: string;
  chartTable: string;
  chartType: (type: ChartTypeChoice) => string;
  chartSeries: (series: ChartSeriesChoice) => string;
  chartTitle: string;
  chartSource: string;
}

export function figureIds(prefix: string): FigureIds {
  return {
    kind: `${prefix}-tile-photo`,
    tile: (tile) => `${prefix}-tile-${tile}`,
    grafikSource: (source) => `${prefix}-grafik-${source}`,
    photoFile: (i) => `${prefix}-foto-${i}-berkas`,
    photoAlt: (i) => `${prefix}-foto-${i}-alt`,
    photoCaption: (i) => `${prefix}-foto-${i}-keterangan`,
    photoCredit: (i) => `${prefix}-foto-${i}-kredit`,
    photoRemove: (i) => `${prefix}-foto-${i}-hapus`,
    swapPhotos: `${prefix}-tukar-urutan`,
    addPhoto: `${prefix}-tambah-foto`,
    photosGroup: `${prefix}-kumpulan-foto`,
    sharedCredit: `${prefix}-kredit-bersama`,
    diagramTitle: `${prefix}-diagram-judul`,
    diagramSource: `${prefix}-diagram-sumber`,
    diagramImage: `${prefix}-diagram-berkas`,
    diagramImageAlt: `${prefix}-diagram-alt`,
    barsGroup: `${prefix}-batang`,
    barUnit: `${prefix}-batang-satuan`,
    barLabel: (i) => `${prefix}-batang-${i}-label`,
    barValue: (i) => `${prefix}-batang-${i}-nilai`,
    barRemove: (i) => `${prefix}-batang-${i}-hapus`,
    addBar: `${prefix}-tambah-batang`,
    chartTable: `${prefix}-grafik-tabel`,
    chartType: (type) => `${prefix}-grafik-jenis-${type}`,
    chartSeries: (series) => `${prefix}-grafik-data-${series}`,
    chartTitle: `${prefix}-grafik-judul`,
    chartSource: `${prefix}-grafik-sumber`,
  };
}

// --- Validation ---

/** Text rules shared with the server: no tags, no control or direction-changing characters. */
function textProblem(value: string, what: string): string | null {
  if (hasHtmlTag(value)) return `${what} tidak boleh memuat tag HTML.`;
  if (hasUnsafeCharacters(value)) {
    return `${what} memuat karakter yang tidak diizinkan.`;
  }
  return null;
}

// Whole part: plain digits, or digits grouped by dots in threes ("1.234.567").
const WHOLE_PART = /^-?(?:\d+|\d{1,3}(?:\.\d{3})+)$/;

/**
 * Reads a typed number by the Indonesian convention: dots are thousands separators and the comma is
 * the decimal mark. "1.234" is 1234, "1.234,5" is 1234.5 and "0,5" is 0.5. A dot that is not a
 * valid thousands grouping ("12.5", "1.23") is refused rather than guessed at.
 */
export function parseBarValue(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const parts = trimmed.split(',');
  if (parts.length > 2) return null;
  const [whole = '', fraction] = parts;
  if (!WHOLE_PART.test(whole)) return null;
  if (fraction !== undefined && !/^\d+$/.test(fraction)) return null;
  const parsed = Number(
    `${whole.replace(/\./g, '')}${fraction === undefined ? '' : `.${fraction}`}`,
  );
  return Number.isFinite(parsed) ? parsed : null;
}

// One dot followed by exactly three digits and no comma: valid, but easy to mean as a decimal.
const SINGLE_DOT_THOUSANDS = /^-?\d{1,3}\.\d{3}$/;

/**
 * A non-blocking note for the one reading that surprises people: "12.500" is twelve thousand five
 * hundred (the dot is a thousands separator), not twelve and a half. Null when there is nothing to
 * point out.
 */
export function barValueNote(text: string): string | null {
  const trimmed = text.trim();
  if (!SINGLE_DOT_THOUSANDS.test(trimmed)) return null;
  const value = parseBarValue(trimmed);
  if (value === null) return null;
  return `Dibaca ${formatBarValue(value)}. Untuk desimal, pakai koma, misalnya 12,5.`;
}

/** Plain-Indonesian reason a typed bar number cannot be used, or null when it can. */
export function barValueProblem(text: string, where: string): string | null {
  if (parseBarValue(text) !== null) return null;
  if (/^-?\d+\.\d+$/.test(text.trim())) {
    return `Angka untuk ${where} memakai titik desimal. Gunakan koma untuk desimal, misalnya 12,5; titik hanya untuk ribuan, misalnya 1.234.`;
  }
  return `Isi angka yang valid untuk ${where}, misalnya 125, 12,5 atau 1.234,5.`;
}

interface Collector {
  problems: FigureProblem[];
  add: (fieldId: string, message: string) => void;
}

function collector(): Collector {
  const problems: FigureProblem[] = [];
  return { problems, add: (fieldId, message) => problems.push({ fieldId, message }) };
}

function photoLabel(tile: FigureTile, index: number): string {
  if (tile === 'photo') return 'foto';
  if (tile === 'photos-2') return `gambar ${index + 1}`;
  return `foto ${index + 1}`;
}

function validatePhotos(
  draft: FigureDraft,
  ids: FigureIds,
  out: Collector,
): FigurePhotoInput[] | null {
  const tile = draft.tile as 'photo' | 'photos-2' | 'gallery';
  const rows = tile === 'photo' ? draft.photos.slice(0, 1) : draft.photos;
  const start = out.problems.length;

  if (tile === 'photo' && rows.length < 1) {
    out.add(ids.photoFile(0), 'Pilih foto yang akan ditampilkan.');
  }
  if (tile === 'photos-2' && rows.length !== 2) {
    out.add(ids.swapPhotos, '2 gambar membutuhkan tepat 2 foto.');
  }
  if (
    tile === 'gallery' &&
    (rows.length < GALLERY_PHOTOS_MIN || rows.length > FIGURE_LIMITS.photosMax)
  ) {
    out.add(
      ids.addPhoto,
      `Galeri membutuhkan ${GALLERY_PHOTOS_MIN} sampai ${FIGURE_LIMITS.photosMax} foto.`,
    );
  }

  if (tile !== 'photo') {
    const shared = draft.sharedCredit.trim();
    const problem =
      shared.length > FIGURE_LIMITS.credit
        ? `Sumber bersama untuk semua foto maksimal ${FIGURE_LIMITS.credit} karakter.`
        : textProblem(shared, 'Sumber bersama untuk semua foto');
    if (problem) out.add(ids.sharedCredit, problem);
  }

  const seen = new Set<string>();
  const photos: FigurePhotoInput[] = [];
  rows.forEach((row, index) => {
    const label = photoLabel(tile, index);
    const alt = row.alt.trim();
    const caption = row.caption.trim();
    const credit = row.credit.trim();

    if (!row.mediaId) {
      out.add(ids.photoFile(index), `Pilih berkas untuk ${label}.`);
    } else if (seen.has(row.mediaId)) {
      out.add(
        ids.photoFile(index),
        `Berkas untuk ${label} sama dengan foto lain. Pilih foto yang berbeda.`,
      );
    } else {
      seen.add(row.mediaId);
    }

    const altProblem =
      alt === ''
        ? `Teks alternatif untuk ${label} wajib diisi. Tulis apa yang terlihat pada foto.`
        : alt.length > FIGURE_LIMITS.alt
          ? `Teks alternatif untuk ${label} maksimal ${FIGURE_LIMITS.alt} karakter.`
          : textProblem(alt, `Teks alternatif untuk ${label}`);
    if (altProblem) out.add(ids.photoAlt(index), altProblem);

    const captionProblem =
      caption.length > FIGURE_LIMITS.caption
        ? `Keterangan untuk ${label} maksimal ${FIGURE_LIMITS.caption} karakter.`
        : textProblem(caption, `Keterangan untuk ${label}`);
    if (captionProblem) out.add(ids.photoCaption(index), captionProblem);

    const creditProblem =
      credit.length > FIGURE_LIMITS.credit
        ? `Sumber foto untuk ${label} maksimal ${FIGURE_LIMITS.credit} karakter.`
        : textProblem(credit, `Sumber foto untuk ${label}`);
    if (creditProblem) out.add(ids.photoCredit(index), creditProblem);

    if (row.mediaId) {
      photos.push({
        mediaId: row.mediaId,
        alt,
        ...(caption ? { caption } : {}),
        ...(credit ? { credit } : {}),
      });
    }
  });

  return out.problems.length === start ? photos : null;
}

/** The uploaded-picture chart ("Unggah gambar grafik"): the stored `diagram` kind. */
function validateUploadedChart(
  draft: FigureDraft,
  ids: FigureIds,
  out: Collector,
): SectionFigure | null {
  const start = out.problems.length;
  const title = draft.diagramTitle.trim();
  const source = draft.diagramSource.trim();

  if (title === '') {
    out.add(ids.diagramTitle, 'Judul grafik wajib diisi.');
  } else if (title.length > FIGURE_LIMITS.diagramTitle) {
    out.add(ids.diagramTitle, `Judul grafik maksimal ${FIGURE_LIMITS.diagramTitle} karakter.`);
  } else {
    const problem = textProblem(title, 'Judul grafik');
    if (problem) out.add(ids.diagramTitle, problem);
  }
  if (source.length > FIGURE_LIMITS.diagramSource) {
    out.add(ids.diagramSource, `Sumber grafik maksimal ${FIGURE_LIMITS.diagramSource} karakter.`);
  } else if (source) {
    const problem = textProblem(source, 'Sumber grafik');
    if (problem) out.add(ids.diagramSource, problem);
  }

  const imageAlt = draft.diagramImageAlt.trim();
  const hasImage = draft.diagramImageId !== null;
  if (hasImage) {
    if (imageAlt === '') {
      out.add(
        ids.diagramImageAlt,
        'Teks alternatif untuk gambar grafik wajib diisi. Tulis apa yang terlihat pada grafik.',
      );
    } else if (imageAlt.length > FIGURE_LIMITS.alt) {
      out.add(ids.diagramImageAlt, `Teks alternatif maksimal ${FIGURE_LIMITS.alt} karakter.`);
    } else {
      const problem = textProblem(imageAlt, 'Teks alternatif gambar grafik');
      if (problem) out.add(ids.diagramImageAlt, problem);
    }
  }

  const filledBars = draft.bars
    .map((bar, index) => ({ bar, index }))
    .filter(({ bar }) => bar.label.trim() !== '' || bar.value.trim() !== '');
  const items: { label: string; value: number }[] = [];
  filledBars.forEach(({ bar, index }) => {
    const label = bar.label.trim();
    const where = `batang ${index + 1}`;
    if (label === '') {
      out.add(ids.barLabel(index), `Nama untuk ${where} wajib diisi.`);
    } else if (label.length > FIGURE_LIMITS.barLabel) {
      out.add(ids.barLabel(index), `Nama ${where} maksimal ${FIGURE_LIMITS.barLabel} karakter.`);
    } else {
      const problem = textProblem(label, `Nama ${where}`);
      if (problem) out.add(ids.barLabel(index), problem);
    }
    const value = parseBarValue(bar.value);
    const valueProblem = barValueProblem(bar.value, where);
    if (value === null || valueProblem) {
      out.add(ids.barValue(index), valueProblem ?? `Isi angka yang valid untuk ${where}.`);
    } else if (label !== '') {
      items.push({ label, value });
    }
  });
  if (filledBars.length > FIGURE_LIMITS.barsMax) {
    out.add(ids.addBar, `Data batang maksimal ${FIGURE_LIMITS.barsMax} baris.`);
  }

  const unit = draft.barUnit.trim();
  if (filledBars.length > 0 && unit.length > FIGURE_LIMITS.barUnit) {
    out.add(ids.barUnit, `Satuan maksimal ${FIGURE_LIMITS.barUnit} karakter.`);
  } else if (filledBars.length > 0 && unit) {
    const problem = textProblem(unit, 'Satuan');
    if (problem) out.add(ids.barUnit, problem);
  }

  if (!hasImage && filledBars.length === 0) {
    out.add(
      ids.diagramImage,
      'Grafik unggahan membutuhkan gambar atau data batang. Unggah gambar grafik atau isi data batang.',
    );
  }

  if (out.problems.length !== start) return null;
  const figure: SectionFigure = { kind: 'diagram', title };
  if (source) figure.source = source;
  if (hasImage && draft.diagramImageId) {
    figure.image = { mediaId: draft.diagramImageId, alt: imageAlt };
  }
  if (items.length > 0) figure.bars = { ...(unit ? { unit } : {}), items };
  return figure;
}

/**
 * The chart that reads a table of the Data menu. `tables` lists the tables of this page (null while
 * they are still loading: the table is then not checked here, the server does). A "by_sex" series
 * needs a table that is split by sex.
 */
function validateTableChart(
  draft: FigureDraft,
  ids: FigureIds,
  tables: readonly ChartTableOption[] | null,
  out: Collector,
): SectionFigure | null {
  const start = out.problems.length;
  const tableId = draft.chartTableId;
  const option = tables?.find((table) => table.id === tableId) ?? null;

  if (tableId === '') {
    out.add(ids.chartTable, 'Pilih tabel data untuk grafik.');
  } else if (tables !== null && option === null) {
    out.add(ids.chartTable, 'Tabel data ini tidak ditemukan di halaman ini. Pilih tabel lain.');
  }
  if (draft.chartSeries === 'by_sex' && option !== null && !option.sexSplit) {
    out.add(ids.chartSeries('by_sex'), 'Tabel ini hanya memuat jumlah total.');
  }
  if (draft.chartSeries === 'total' && isSexOnlyChartType(draft.chartType)) {
    out.add(
      ids.chartSeries('by_sex'),
      'Jenis grafik ini hanya bisa menurut jenis kelamin. Pilih Menurut jenis kelamin.',
    );
  }

  const title = draft.chartTitle.trim();
  const source = draft.chartSource.trim();
  if (title === '') {
    out.add(ids.chartTitle, 'Judul grafik wajib diisi.');
  } else if (title.length > FIGURE_LIMITS.diagramTitle) {
    out.add(ids.chartTitle, `Judul grafik maksimal ${FIGURE_LIMITS.diagramTitle} karakter.`);
  } else {
    const problem = textProblem(title, 'Judul grafik');
    if (problem) out.add(ids.chartTitle, problem);
  }
  if (source.length > FIGURE_LIMITS.diagramSource) {
    out.add(ids.chartSource, `Sumber data maksimal ${FIGURE_LIMITS.diagramSource} karakter.`);
  } else if (source) {
    const problem = textProblem(source, 'Sumber data');
    if (problem) out.add(ids.chartSource, problem);
  }

  if (out.problems.length !== start) return null;
  return {
    kind: 'chart',
    tableId,
    chartType: draft.chartType,
    series: draft.chartSeries,
    title,
    ...(source ? { source } : {}),
  };
}

export interface FigureValidation {
  problems: FigureProblem[];
  /** The figure to send; null while there are problems or no kind is chosen. */
  figure: SectionFigure | null;
}

/**
 * Checks the draft and builds the figure to store. `chartTables` is the page's table list for the
 * Grafik tile (null while it has not loaded).
 */
export function validateFigureDraft(
  draft: FigureDraft,
  ids: FigureIds,
  chartTables: readonly ChartTableOption[] | null = null,
): FigureValidation {
  const out = collector();
  const kind = kindOfDraft(draft);
  if (kind === null) {
    out.add(ids.kind, 'Pilih jenis figur terlebih dahulu.');
    return { problems: out.problems, figure: null };
  }
  if (kind === 'chart') {
    const figure = validateTableChart(draft, ids, chartTables, out);
    return { problems: out.problems, figure };
  }
  if (kind === 'diagram') {
    const figure = validateUploadedChart(draft, ids, out);
    return { problems: out.problems, figure };
  }
  const photos = validatePhotos(draft, ids, out);
  if (!photos) return { problems: out.problems, figure: null };
  if (draft.tile === 'photo') {
    const [first] = photos;
    return { problems: out.problems, figure: first ? { kind: 'photo', photos: [first] } : null };
  }
  const shared = draft.sharedCredit.trim();
  return {
    problems: out.problems,
    figure: { kind: 'photos', ...(shared ? { credit: shared } : {}), photos },
  };
}

/** One line describing a stored figure, for the "currently saved" note. */
export function describeFigure(figure: SectionFigure | null): string {
  if (!figure)
    return 'Gambar tersimpan, tetapi isinya tidak dapat dibaca. Simpan gambar baru untuk menggantinya.';
  if (figure.kind === 'photo') return 'Tersimpan: satu foto.';
  if (figure.kind === 'photos') return `Tersimpan: ${figure.photos.length} foto.`;
  if (figure.kind === 'chart') return `Tersimpan: grafik “${figure.title}”.`;
  return `Tersimpan: grafik unggahan “${figure.title}”.`;
}

/** What a stored figure is, in a few words, for a note about someone else's version. */
export function summarizeFigure(figure: SectionFigure | null, exists: boolean): string {
  if (!exists) return 'bagian ini tidak memiliki gambar';
  if (!figure) return 'gambar yang isinya tidak dapat dibaca';
  if (figure.kind === 'photo') return 'satu foto';
  if (figure.kind === 'photos') return `${figure.photos.length} foto`;
  if (figure.kind === 'chart') return `grafik “${figure.title}”`;
  return `grafik unggahan “${figure.title}”`;
}
