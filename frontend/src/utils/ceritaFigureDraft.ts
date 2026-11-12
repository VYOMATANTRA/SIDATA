import {
  FIGURE_LIMITS,
  type FigurePhotoInput,
  type SectionFigure,
} from '../services/ceritaFigure.service';

/**
 * The editor's working copy of a section figure, and the one place that turns it into the stored
 * shape (or into plain-Indonesian problems). Nothing here names a field or an API term.
 */

export type FigureKind = 'photo' | 'photos' | 'diagram';

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
  kind: FigureKind | null;
  photos: PhotoFields[];
  diagramTitle: string;
  diagramSource: string;
  diagramImageId: string | null;
  diagramImageAlt: string;
  barUnit: string;
  bars: BarFields[];
}

export interface FigureProblem {
  fieldId: string;
  message: string;
}

export const KIND_LABELS: Readonly<Record<FigureKind, string>> = {
  photo: 'Satu foto',
  photos: 'Beberapa foto',
  diagram: 'Diagram',
};

export function emptyPhoto(): PhotoFields {
  return { mediaId: null, alt: '', caption: '', credit: '' };
}

export function emptyBar(): BarFields {
  return { label: '', value: '' };
}

export function emptyDraft(): FigureDraft {
  return {
    kind: null,
    photos: [],
    diagramTitle: '',
    diagramSource: '',
    diagramImageId: null,
    diagramImageAlt: '',
    barUnit: '',
    bars: [],
  };
}

/** Number as an Indonesian editor would write it: decimal comma, no thousands dots. */
export function formatBarValue(value: number): string {
  return String(value).replace('.', ',');
}

export function draftFromFigure(figure: SectionFigure | null): FigureDraft {
  const draft = emptyDraft();
  if (!figure) return draft;

  draft.kind = figure.kind;
  if (figure.kind === 'photo' || figure.kind === 'photos') {
    draft.photos = figure.photos.map((photo) => ({
      mediaId: photo.mediaId,
      alt: photo.alt,
      caption: photo.caption ?? '',
      credit: photo.credit ?? '',
    }));
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

/**
 * What the figure editor would store, as a string, so "has the draft changed?" is a plain
 * comparison. Only the parts that matter for the chosen kind count: a photo kept in the draft
 * after switching to a diagram does not make the draft look edited.
 */
export function draftSignature(draft: FigureDraft): string {
  if (draft.kind === null) return 'none';
  if (draft.kind === 'diagram') {
    return JSON.stringify([
      'diagram',
      draft.diagramTitle,
      draft.diagramSource,
      draft.diagramImageId,
      draft.diagramImageAlt,
      draft.barUnit,
      draft.bars.map((bar) => [bar.label, bar.value]),
    ]);
  }
  const photos = draft.kind === 'photo' ? draft.photos.slice(0, 1) : draft.photos;
  return JSON.stringify([
    draft.kind,
    photos.map((photo) => [photo.mediaId, photo.alt, photo.caption, photo.credit]),
  ]);
}

// --- Ids (so an error summary can focus a field) ---

export interface FigureIds {
  /** First kind option: where an error about the missing kind sends focus. */
  kind: string;
  kindOption: (kind: FigureKind) => string;
  photoFile: (index: number) => string;
  photoAlt: (index: number) => string;
  photoCaption: (index: number) => string;
  photoCredit: (index: number) => string;
  photoUp: (index: number) => string;
  photoDown: (index: number) => string;
  photoRemove: (index: number) => string;
  addPhoto: string;
  photosGroup: string;
  diagramTitle: string;
  diagramSource: string;
  diagramImage: string;
  diagramImageAlt: string;
  barsGroup: string;
  barUnit: string;
  barLabel: (index: number) => string;
  barValue: (index: number) => string;
  barUp: (index: number) => string;
  barDown: (index: number) => string;
  barRemove: (index: number) => string;
  addBar: string;
}

export function figureIds(prefix: string): FigureIds {
  return {
    kind: `${prefix}-jenis-photo`,
    kindOption: (kind) => `${prefix}-jenis-${kind}`,
    photoFile: (i) => `${prefix}-foto-${i}-berkas`,
    photoAlt: (i) => `${prefix}-foto-${i}-alt`,
    photoCaption: (i) => `${prefix}-foto-${i}-keterangan`,
    photoCredit: (i) => `${prefix}-foto-${i}-kredit`,
    photoUp: (i) => `${prefix}-foto-${i}-naik`,
    photoDown: (i) => `${prefix}-foto-${i}-turun`,
    photoRemove: (i) => `${prefix}-foto-${i}-hapus`,
    addPhoto: `${prefix}-tambah-foto`,
    photosGroup: `${prefix}-kumpulan-foto`,
    diagramTitle: `${prefix}-diagram-judul`,
    diagramSource: `${prefix}-diagram-sumber`,
    diagramImage: `${prefix}-diagram-berkas`,
    diagramImageAlt: `${prefix}-diagram-alt`,
    barsGroup: `${prefix}-batang`,
    barUnit: `${prefix}-batang-satuan`,
    barLabel: (i) => `${prefix}-batang-${i}-label`,
    barValue: (i) => `${prefix}-batang-${i}-nilai`,
    barUp: (i) => `${prefix}-batang-${i}-naik`,
    barDown: (i) => `${prefix}-batang-${i}-turun`,
    barRemove: (i) => `${prefix}-batang-${i}-hapus`,
    addBar: `${prefix}-tambah-batang`,
  };
}

// --- Validation ---

const HTML_TAG = /<[a-z!/]/i;
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;
const BIDI_CHARS = /[‎‏‪-‮⁦-⁩]/;

/** Text rules shared with the server: no tags, no control or direction-changing characters. */
function textProblem(value: string, what: string): string | null {
  if (HTML_TAG.test(value)) return `${what} tidak boleh memuat tag HTML.`;
  if (CONTROL_CHARS.test(value) || BIDI_CHARS.test(value)) {
    return `${what} memuat karakter yang tidak diizinkan.`;
  }
  return null;
}

/** Parses a typed number: "1234", "12,5" and "12.5" are numbers; "1.234,5" drops the dot. */
export function parseBarValue(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const normalised = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed;
  if (!/^-?\d+(\.\d+)?$/.test(normalised)) return null;
  const parsed = Number(normalised);
  return Number.isFinite(parsed) ? parsed : null;
}

interface Collector {
  problems: FigureProblem[];
  add: (fieldId: string, message: string) => void;
}

function collector(): Collector {
  const problems: FigureProblem[] = [];
  return { problems, add: (fieldId, message) => problems.push({ fieldId, message }) };
}

function photoLabel(kind: FigureKind, index: number): string {
  return kind === 'photo' ? 'foto' : `foto ${index + 1}`;
}

function validatePhotos(
  draft: FigureDraft,
  ids: FigureIds,
  out: Collector,
): FigurePhotoInput[] | null {
  const kind = draft.kind as 'photo' | 'photos';
  const rows = kind === 'photo' ? draft.photos.slice(0, 1) : draft.photos;
  const start = out.problems.length;

  if (kind === 'photo' && rows.length < 1) {
    out.add(ids.photoFile(0), 'Pilih foto yang akan ditampilkan.');
  }
  if (
    kind === 'photos' &&
    (rows.length < FIGURE_LIMITS.photosMin || rows.length > FIGURE_LIMITS.photosMax)
  ) {
    out.add(
      ids.addPhoto,
      `Beberapa foto membutuhkan ${FIGURE_LIMITS.photosMin} sampai ${FIGURE_LIMITS.photosMax} foto.`,
    );
  }

  const seen = new Set<string>();
  const photos: FigurePhotoInput[] = [];
  rows.forEach((row, index) => {
    const label = photoLabel(kind, index);
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
        ? `Teks pengganti untuk ${label} wajib diisi. Tulis apa yang terlihat pada foto.`
        : alt.length > FIGURE_LIMITS.alt
          ? `Teks pengganti untuk ${label} maksimal ${FIGURE_LIMITS.alt} karakter.`
          : textProblem(alt, `Teks pengganti untuk ${label}`);
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

function validateDiagram(draft: FigureDraft, ids: FigureIds, out: Collector): SectionFigure | null {
  const start = out.problems.length;
  const title = draft.diagramTitle.trim();
  const source = draft.diagramSource.trim();

  if (title === '') {
    out.add(ids.diagramTitle, 'Judul diagram wajib diisi.');
  } else if (title.length > FIGURE_LIMITS.diagramTitle) {
    out.add(ids.diagramTitle, `Judul diagram maksimal ${FIGURE_LIMITS.diagramTitle} karakter.`);
  } else {
    const problem = textProblem(title, 'Judul diagram');
    if (problem) out.add(ids.diagramTitle, problem);
  }
  if (source.length > FIGURE_LIMITS.diagramSource) {
    out.add(ids.diagramSource, `Sumber diagram maksimal ${FIGURE_LIMITS.diagramSource} karakter.`);
  } else if (source) {
    const problem = textProblem(source, 'Sumber diagram');
    if (problem) out.add(ids.diagramSource, problem);
  }

  const imageAlt = draft.diagramImageAlt.trim();
  const hasImage = draft.diagramImageId !== null;
  if (hasImage) {
    if (imageAlt === '') {
      out.add(
        ids.diagramImageAlt,
        'Teks pengganti untuk gambar diagram wajib diisi. Tulis apa yang terlihat pada diagram.',
      );
    } else if (imageAlt.length > FIGURE_LIMITS.alt) {
      out.add(ids.diagramImageAlt, `Teks pengganti maksimal ${FIGURE_LIMITS.alt} karakter.`);
    } else {
      const problem = textProblem(imageAlt, 'Teks pengganti gambar diagram');
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
    if (value === null) {
      out.add(ids.barValue(index), `Isi angka yang valid untuk ${where}, misalnya 125 atau 12,5.`);
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
      'Diagram membutuhkan gambar atau data batang. Unggah gambar diagram atau isi data batang.',
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

export interface FigureValidation {
  problems: FigureProblem[];
  /** The figure to send; null while there are problems or no kind is chosen. */
  figure: SectionFigure | null;
}

export function validateFigureDraft(draft: FigureDraft, ids: FigureIds): FigureValidation {
  const out = collector();
  if (draft.kind === null) {
    out.add(ids.kind, 'Pilih jenis gambar terlebih dahulu.');
    return { problems: out.problems, figure: null };
  }
  if (draft.kind === 'diagram') {
    const figure = validateDiagram(draft, ids, out);
    return { problems: out.problems, figure };
  }
  const photos = validatePhotos(draft, ids, out);
  if (!photos) return { problems: out.problems, figure: null };
  if (draft.kind === 'photo') {
    const [first] = photos;
    return { problems: out.problems, figure: first ? { kind: 'photo', photos: [first] } : null };
  }
  return { problems: out.problems, figure: { kind: 'photos', photos } };
}

/** One line describing a stored figure, for the "currently saved" note. */
export function describeFigure(figure: SectionFigure | null): string {
  if (!figure)
    return 'Gambar tersimpan, tetapi isinya tidak dapat dibaca. Simpan gambar baru untuk menggantinya.';
  if (figure.kind === 'photo') return 'Tersimpan: satu foto.';
  if (figure.kind === 'photos') return `Tersimpan: ${figure.photos.length} foto.`;
  return `Tersimpan: diagram “${figure.title}”.`;
}
