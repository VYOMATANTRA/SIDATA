/**
 * Only a site path, an HTTPS address, or a blob URL this page made is ever used as a picture source.
 * Stored figures only ever carry a site path; a blob URL comes from the editor's live preview, which
 * fetches an authenticated photo and cannot point an `<img>` at the API directly.
 */
export function safeImageSrc(src: string | undefined | null): string | null {
  const value = (src ?? '').trim();
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (/^blob:[^\s]+$/i.test(value)) return value;
  if (/^https:\/\/[^/]+/i.test(value)) return value;
  return null;
}
