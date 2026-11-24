/**
 * Builds the composite key used to track failed authentication attempts.
 *
 * Login attempts are keyed by endpoint + client IP + identifier (email) so a
 * single account cannot be brute-forced from one host, while the per-IP
 * throttler still caps attempts spread across many identifiers.
 */
export function buildAuthAttemptKey(endpoint: string, ip: string, identifier?: string): string {
  const normalizedIp = ip.trim().toLowerCase() || 'unknown';
  if (!identifier) {
    return `${endpoint}:${normalizedIp}`;
  }
  return `${endpoint}:${normalizedIp}:${identifier.trim().toLowerCase()}`;
}

/**
 * Masks an email/identifier before it is written to logs or exposed through
 * the telemetry endpoint, so operators see the pattern without collecting
 * plaintext account names.
 */
export function maskIdentifier(identifier: string): string {
  const value = identifier.trim();
  const atIndex = value.indexOf('@');
  if (atIndex > 0) {
    const local = value.slice(0, atIndex);
    const domain = value.slice(atIndex + 1);
    const visible = local.slice(0, 1);
    return `${visible}***@${domain}`;
  }
  if (value.length <= 4) {
    return '***';
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}
