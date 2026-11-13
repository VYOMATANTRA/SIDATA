import { describe, expect, it, vi } from 'vitest';

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.reject(new Error('PasswordException')),
    destroy: vi.fn<() => void>(),
  }),
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }));

import { renderPdfFirstPage } from '../utils/pdfFirstPageCover';

describe('renderPdfFirstPage', () => {
  it('resolves to null instead of throwing when the PDF cannot be opened', async () => {
    const file = new File(['%PDF-1.4'], 'terkunci.pdf', { type: 'application/pdf' });
    await expect(renderPdfFirstPage(file)).resolves.toBeNull();
  });
});
