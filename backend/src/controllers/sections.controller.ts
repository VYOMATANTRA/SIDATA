import {
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
} from '../services/sections.service.js';
import { createProseBlock, reorderProseBlocks } from '../services/contentBlocks.service.js';
import { authoringHandler, expectedUpdatedAtFromQuery, paramOf } from './hierarchyHandler.js';

// POST /api/chapters/:id/sections
export const createSectionHandler = authoringHandler({
  errorLabel: 'menambahkan bagian',
  successStatus: 201,
  run: async (req, actor, context) => {
    const result = await createSection(paramOf(req, 'id'), req.body, actor, context);
    return { message: 'Bagian berhasil ditambahkan', ...result };
  },
});

// PUT /api/chapters/:id/sections/reorder
export const reorderSectionsHandler = authoringHandler({
  errorLabel: 'mengubah urutan bagian',
  run: async (req, actor, context) => {
    const result = await reorderSections(paramOf(req, 'id'), req.body, actor, context);
    return { message: 'Urutan bagian berhasil diperbarui', ...result };
  },
});

// PATCH /api/sections/:id
export const updateSectionHandler = authoringHandler({
  errorLabel: 'memperbarui bagian',
  run: async (req, actor, context) => {
    const section = await updateSection(paramOf(req, 'id'), req.body, actor, context);
    return { message: 'Bagian berhasil diperbarui', section };
  },
});

// DELETE /api/sections/:id?expectedUpdatedAt=…
export const deleteSectionHandler = authoringHandler({
  errorLabel: 'menghapus bagian',
  run: async (req, actor, context) => {
    const result = await deleteSection(
      paramOf(req, 'id'),
      expectedUpdatedAtFromQuery(req),
      actor,
      context,
    );
    return { message: 'Bagian berhasil dihapus', ...result };
  },
});

// POST /api/sections/:id/content-blocks
export const createSectionBlockHandler = authoringHandler({
  errorLabel: 'menambahkan blok konten',
  successStatus: 201,
  run: async (req, actor, context) => {
    const result = await createProseBlock(paramOf(req, 'id'), req.body, actor, context);
    return { message: 'Blok konten berhasil ditambahkan', ...result };
  },
});

// PUT /api/sections/:id/content-blocks/reorder
export const reorderSectionBlocksHandler = authoringHandler({
  errorLabel: 'mengubah urutan blok konten',
  run: async (req, actor, context) => {
    const result = await reorderProseBlocks(paramOf(req, 'id'), req.body, actor, context);
    return { message: 'Urutan blok konten berhasil diperbarui', ...result };
  },
});
