import {
  createChapter,
  updateChapter,
  deleteChapter,
  reorderChapters,
} from '../services/chapters.service.js';
import { authoringHandler, expectedUpdatedAtFromQuery, paramOf } from './hierarchyHandler.js';

// POST /api/pages/:slug/chapters
export const createChapterHandler = authoringHandler({
  errorLabel: 'menambahkan bab',
  successStatus: 201,
  run: async (req, actor, context) => {
    const result = await createChapter(paramOf(req, 'slug'), req.body, actor, context);
    return { message: 'Bab berhasil ditambahkan', ...result };
  },
});

// PUT /api/pages/:slug/chapters/reorder
export const reorderChaptersHandler = authoringHandler({
  errorLabel: 'mengubah urutan bab',
  run: async (req, actor, context) => {
    const result = await reorderChapters(paramOf(req, 'slug'), req.body, actor, context);
    return { message: 'Urutan bab berhasil diperbarui', ...result };
  },
});

// PATCH /api/chapters/:id
export const updateChapterHandler = authoringHandler({
  errorLabel: 'memperbarui bab',
  run: async (req, actor, context) => {
    const chapter = await updateChapter(paramOf(req, 'id'), req.body, actor, context);
    return { message: 'Bab berhasil diperbarui', chapter };
  },
});

// DELETE /api/chapters/:id?expectedUpdatedAt=…
export const deleteChapterHandler = authoringHandler({
  errorLabel: 'menghapus bab',
  run: async (req, actor, context) => {
    const result = await deleteChapter(
      paramOf(req, 'id'),
      expectedUpdatedAtFromQuery(req),
      actor,
      context,
    );
    return { message: 'Bab berhasil dihapus', ...result };
  },
});
