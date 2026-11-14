import { putPublikasiCatalog } from '../services/publikasiCatalog.service.js';
import { authoringHandler } from './hierarchyHandler.js';

// PUT /api/publikasi/catalog
export const putPublikasiCatalogHandler = authoringHandler({
  errorLabel: 'menyimpan katalog publikasi',
  run: async (req, actor, context) => {
    const block = await putPublikasiCatalog(req.body, actor, context);
    return { message: 'Katalog publikasi berhasil disimpan', block };
  },
});
