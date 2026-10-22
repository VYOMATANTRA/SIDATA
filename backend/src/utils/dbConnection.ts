/**
 * `allowPublicKeyRetrieval` lets the server fetch the MySQL RSA public key over the wire.
 * Over an unverified channel that hands the key to whoever sits in the middle, so the
 * database password can be captured. It therefore stays off unless the deployment asks
 * for it explicitly with `?allowPublicKeyRetrieval=true` in the connection string.
 */
export function allowPublicKeyRetrievalFrom(url: URL): boolean {
  return url.searchParams.get('allowPublicKeyRetrieval') === 'true';
}
