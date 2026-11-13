/**
 * Renders page 1 of a PDF to a JPEG `File`, in the browser, so an uploaded publication can get a
 * cover without the server ever parsing a PDF. pdf.js is imported on demand: the admin
 * Publikasi screen pays for it only when a PDF is actually chosen. Any failure (encrypted or
 * damaged file, no canvas, timeout) resolves to `null`; the caller then asks for a manual cover.
 */

const LONG_EDGE_PX = 1600;
const JPEG_QUALITY = 0.85;
const TIMEOUT_MS = 20000;

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', JPEG_QUALITY),
  );
}

async function render(file: File): Promise<File | null> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = LONG_EDGE_PX / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) return null;
    // JPEG has no alpha: paint white first so a transparent page is not black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;

    const blob = await canvasToBlob(canvas);
    if (!blob) return null;
    const stem = file.name.replace(/\.[^.]+$/, '') || 'sampul';
    return new File([blob], `${stem}-sampul.jpg`, { type: 'image/jpeg' });
  } finally {
    void task.destroy();
  }
}

/** Page 1 of `file` as a JPEG, or null when it cannot be rendered. Never throws. */
export async function renderPdfFirstPage(file: File): Promise<File | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      render(file),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
