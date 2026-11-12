import { classifyFailure, toUserMessage } from './userMessages';

/**
 * Plain-Indonesian wording for the failures of the Cerita management screen (SPEC §3, §8).
 * Nothing here names a status code, a field or an API term; the server's own sentence is only
 * ever passed through `toUserMessage`, which filters it.
 */

export const HAS_DEPENDENTS_CODE = 'HAS_DEPENDENTS';

export type StructureSubject = 'Halaman' | 'Bab' | 'Bagian' | 'Paragraf' | 'Gambar';

export interface DependencyCounts {
  contentBlocks: number;
  indicators: number;
  indicatorTables: number;
}

function countOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Reads `details.dependencies` from a refused delete, tolerating any other body shape. */
export function dependencyCountsOf(error: unknown): DependencyCounts | null {
  const body =
    typeof error === 'object' && error !== null ? (error as { body?: unknown }).body : undefined;
  const details =
    typeof body === 'object' && body !== null ? (body as { details?: unknown }).details : undefined;
  const deps =
    typeof details === 'object' && details !== null
      ? (details as { dependencies?: unknown }).dependencies
      : undefined;
  if (typeof deps !== 'object' || deps === null) return null;
  const record = deps as Record<string, unknown>;
  return {
    contentBlocks: countOf(record['contentBlocks']),
    indicators: countOf(record['indicators']),
    indicatorTables: countOf(record['indicatorTables']),
  };
}

function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} dan ${parts[parts.length - 1]}`;
}

/** "Bab ini belum bisa dihapus karena masih berisi 2 paragraf atau gambar dan 1 tabel. …" */
export function dependentsMessage(
  subject: StructureSubject,
  counts: DependencyCounts | null,
): string {
  const parts: string[] = [];
  if (counts) {
    if (counts.contentBlocks > 0) parts.push(`${counts.contentBlocks} paragraf atau gambar`);
    if (counts.indicators > 0) parts.push(`${counts.indicators} angka indikator`);
    if (counts.indicatorTables > 0) parts.push(`${counts.indicatorTables} tabel`);
  }
  const what = parts.length > 0 ? joinWords(parts) : 'paragraf, gambar, angka, atau tabel';
  return `${subject} ini belum bisa dihapus karena masih berisi ${what}. Hapus atau pindahkan isi tersebut terlebih dahulu.`;
}

export interface CeritaFailure {
  message: string;
  /** Someone else saved the record first: the draft stays and the screen offers a reload. */
  stale: boolean;
  /** A delete was refused because the record still holds content. */
  blocked: boolean;
}

export interface FailureOptions {
  /** Wording of a plain 409 (a duplicate title, for instance), replacing the generic one. */
  conflictMessage?: string;
  /** Which kind of record a refused delete concerns. */
  subject?: StructureSubject;
}

/**
 * Turns anything thrown by a write into text for a banner or dialog. `context` is the action
 * phrase ("menghapus bab"); delete and reorder contexts get wording that does not claim a form
 * draft exists (see `isNonFormAction`).
 */
export function ceritaFailure(
  error: unknown,
  context: string,
  options: FailureOptions = {},
): CeritaFailure {
  const { kind } = classifyFailure(error);
  const code =
    typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;

  if (code === HAS_DEPENDENTS_CODE) {
    return {
      message: dependentsMessage(options.subject ?? 'Bagian', dependencyCountsOf(error)),
      stale: false,
      blocked: true,
    };
  }
  if (kind === 'conflict' && options.conflictMessage) {
    return { message: options.conflictMessage, stale: false, blocked: false };
  }
  return {
    message: toUserMessage(error, context).message,
    stale: kind === 'stale',
    blocked: false,
  };
}
