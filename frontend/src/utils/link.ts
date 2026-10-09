/**
 * Helper to determine if a URL should be treated as an external destination.
 * Matches absolute protocols (http, https), protocol-relative URLs (//), or explicit target="_blank".
 */
export function isExternalLink(href?: string, target?: string): boolean {
  if (target === '_blank') return true;
  if (!href) return false;
  const trimmed = href.trim();
  return (
    trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('//')
  );
}

/**
 * Computes an accessible, secure `rel` attribute for links.
 * Respects explicit rel prop if provided; otherwise assigns 'noopener noreferrer' to external links.
 */
export function computeLinkRel(href?: string, target?: string, rel?: string): string | undefined {
  if (rel) return rel;
  if (isExternalLink(href, target)) return 'noopener noreferrer';
  return undefined;
}
