import { apiRequestJson } from '../utils/apiClient';
import type { ReorderItem } from '../utils/ceritaOrder';
import type { ContentBlock } from '../stores/contentBlocks.store';

/**
 * Editor/admin writes for the Cerita hierarchy and section paragraphs (SPEC §2, §3, §7). The
 * public reads stay in `pages.store.ts`; this module wraps the write endpoints the
 * `/admin/cerita` screen uses. Every call goes through `apiRequestJson`, so CSRF, the bearer
 * token and one silent session refresh come with it.
 *
 * Every update, delete and reorder carries `expectedUpdatedAt`, the token the editor last saw,
 * so a stale tab is refused (409) instead of overwriting newer work. Deletes send it in the
 * query string because they have no body.
 */

function enc(value: string): string {
  return encodeURIComponent(value);
}

function tokenQuery(expectedUpdatedAt: string): string {
  return `?expectedUpdatedAt=${enc(expectedUpdatedAt)}`;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiRequestJson<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

function patch<T>(path: string, body: unknown): Promise<T> {
  return apiRequestJson<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}

function put<T>(path: string, body: unknown): Promise<T> {
  return apiRequestJson<T>(path, { method: 'PUT', body: JSON.stringify(body) });
}

function remove<T>(path: string): Promise<T> {
  return apiRequestJson<T>(path, { method: 'DELETE' });
}

// --- Pages ---

export async function createPage(title: string): Promise<{ id: string; slug: string }> {
  const data = await post<{ page: { id: string; slug: string } }>('/api/pages', { title });
  return data.page;
}

export async function renamePage(
  slug: string,
  title: string,
  expectedUpdatedAt: string,
): Promise<void> {
  await patch(`/api/pages/${enc(slug)}`, { title, expectedUpdatedAt });
}

/** The optional headline and byline of a page; blank or null clears a field. */
export interface PageDetailsInput {
  headline: string | null;
  bylineAuthor: string | null;
  bylineAffiliation: string | null;
}

export async function updatePageDetails(
  slug: string,
  details: PageDetailsInput,
  expectedUpdatedAt: string,
): Promise<void> {
  await patch(`/api/pages/${enc(slug)}`, { ...details, expectedUpdatedAt });
}

export async function deletePage(slug: string, expectedUpdatedAt: string): Promise<void> {
  await remove(`/api/pages/${enc(slug)}${tokenQuery(expectedUpdatedAt)}`);
}

/** The page list has no parent, so a reorder carries no token. */
export async function reorderPages(items: ReorderItem[]): Promise<void> {
  await put('/api/pages/reorder', { items });
}

// --- Chapters ---

export async function createChapter(pageSlug: string, title: string): Promise<{ id: string }> {
  const data = await post<{ chapter: { id: string } }>(`/api/pages/${enc(pageSlug)}/chapters`, {
    title,
  });
  return data.chapter;
}

export async function renameChapter(
  id: string,
  title: string,
  expectedUpdatedAt: string,
): Promise<void> {
  await patch(`/api/chapters/${enc(id)}`, { title, expectedUpdatedAt });
}

export async function deleteChapter(id: string, expectedUpdatedAt: string): Promise<void> {
  await remove(`/api/chapters/${enc(id)}${tokenQuery(expectedUpdatedAt)}`);
}

/** `expectedUpdatedAt` is the parent page's token. */
export async function reorderChapters(
  pageSlug: string,
  expectedUpdatedAt: string,
  items: ReorderItem[],
): Promise<void> {
  await put(`/api/pages/${enc(pageSlug)}/chapters/reorder`, { expectedUpdatedAt, items });
}

// --- Sections ---

export async function createSection(chapterId: string, title: string): Promise<{ id: string }> {
  const data = await post<{ section: { id: string } }>(`/api/chapters/${enc(chapterId)}/sections`, {
    title,
  });
  return data.section;
}

export async function renameSection(
  id: string,
  title: string,
  expectedUpdatedAt: string,
): Promise<void> {
  await patch(`/api/sections/${enc(id)}`, { title, expectedUpdatedAt });
}

export async function deleteSection(id: string, expectedUpdatedAt: string): Promise<void> {
  await remove(`/api/sections/${enc(id)}${tokenQuery(expectedUpdatedAt)}`);
}

/** The updated token of a section and of the chapter it sits in, as the server returns them. */
export interface SectionTokenResult {
  section: { id: string; chapterId: string; slug: string; title: string | null; updatedAt: string };
  chapter: { id: string; slug: string; updatedAt: string };
}

/**
 * Copies a section (its paragraphs and figure) as the last section of its chapter (SPEC §3). The
 * copy keeps the same page, so only the chapter token of the section's own chapter moves.
 */
export async function duplicateSection(
  id: string,
  expectedUpdatedAt: string,
): Promise<SectionTokenResult> {
  return post<SectionTokenResult>(`/api/sections/${enc(id)}/duplicate`, { expectedUpdatedAt });
}

/**
 * Moves a section to another chapter of the same page (SPEC §3). The server answers 422 for a
 * chapter on another page. The result names the chapter it left as well as the one it joined.
 */
export interface SectionMoveResult extends SectionTokenResult {
  fromChapter: { id: string; slug: string; updatedAt: string };
}

export async function moveSectionToChapter(
  id: string,
  targetChapterId: string,
  expectedUpdatedAt: string,
): Promise<SectionMoveResult> {
  return post<SectionMoveResult>(`/api/sections/${enc(id)}/move`, {
    targetChapterId,
    expectedUpdatedAt,
  });
}

/** `expectedUpdatedAt` is the parent chapter's token. */
export async function reorderSections(
  chapterId: string,
  expectedUpdatedAt: string,
  items: ReorderItem[],
): Promise<void> {
  await put(`/api/chapters/${enc(chapterId)}/sections/reorder`, { expectedUpdatedAt, items });
}

// --- Section text (title and one body, saved together) ---

export interface SectionTextInput {
  title: string;
  /** Limited Markdown; a blank line starts a new paragraph. An empty body removes the text. */
  body: string;
  expectedUpdatedAt: string;
}

/** The section after the save, and its one prose block (null when the body is empty). */
export interface SectionTextResponse {
  section: { id: string; chapterId: string; slug: string; title: string | null; sortOrder: number; updatedAt: string };
  block: ContentBlock | null;
}

/** Saves a section's title and body in one request; the server merges legacy paragraphs into one. */
export async function saveSectionText(
  sectionId: string,
  input: SectionTextInput,
): Promise<SectionTextResponse> {
  return put<SectionTextResponse>(`/api/sections/${enc(sectionId)}/text`, input);
}
