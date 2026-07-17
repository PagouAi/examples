// The contract accepts any of BearerAuth, ApiKeyAuth (header `apiKey`) or BasicAuth.
// The mock accepts any non-empty credential; it never validates a real key.
export function isAuthorized(req) {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string') {
    const m = /^(Bearer|Basic)\s+(.+)$/i.exec(auth.trim());
    if (m && m[2].trim().length > 0) return true;
  }
  const apiKey = req.headers['apikey'];
  if (typeof apiKey === 'string' && apiKey.trim().length > 0) return true;
  return false;
}
