/** Only a site path or an HTTPS address is ever used as a picture source. */
export function safeImageSrc(src: string | undefined | null): string | null {
  const value = (src ?? '').trim();
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (/^https:\/\/[^/]+/i.test(value)) return value;
  return null;
}
