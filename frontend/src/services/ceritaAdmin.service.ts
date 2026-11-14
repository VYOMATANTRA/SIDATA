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

/** `expectedUpdatedAt` is the parent chapter's token. */
export async function reorderSections(
  chapterId: string,
  expectedUpdatedAt: string,
  items: ReorderItem[],
): Promise<void> {
  await put(`/api/chapters/${enc(chapterId)}/sections/reorder`, { expectedUpdatedAt, items });
}

// --- Paragraphs (prose blocks attached to a section) ---

export interface ParagraphInput {
  title: string;
  body: string;
}

export async function createParagraph(
  sectionId: string,
  input: ParagraphInput,
): Promise<ContentBlock> {
  const data = await post<{ block: ContentBlock }>(
    `/api/sections/${enc(sectionId)}/content-blocks`,
    input,
  );
  return data.block;
}

export async function updateParagraph(
  slug: string,
  input: { title: string | null; body: string },
  expectedUpdatedAt: string,
): Promise<ContentBlock> {
  const data = await patch<{ block: ContentBlock }>(`/api/content-blocks/${enc(slug)}`, {
    ...input,
    expectedUpdatedAt,
  });
  return data.block;
}

/** `expectedUpdatedAt` is the paragraph's own token. */
export async function deleteParagraph(slug: string, expectedUpdatedAt: string): Promise<void> {
  await remove(`/api/content-blocks/${enc(slug)}${tokenQuery(expectedUpdatedAt)}`);
}

/** `expectedUpdatedAt` is the parent section's token. */
export async function reorderParagraphs(
  sectionId: string,
  expectedUpdatedAt: string,
  items: ReorderItem[],
): Promise<void> {
  await put(`/api/sections/${enc(sectionId)}/content-blocks/reorder`, {
    expectedUpdatedAt,
    items,
  });
}
