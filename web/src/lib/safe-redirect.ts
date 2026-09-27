/**
 * The `next` search param, only when it is a path on this site. Rejects absolute URLs,
 * protocol-relative (//host) and backslash tricks (/\host) that browsers treat as another origin.
 */
export function safeNext(search: string): string | null {
  const next = new URLSearchParams(search).get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\'))
    return null;
  return next;
}
