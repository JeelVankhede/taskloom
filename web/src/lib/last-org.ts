/**
 * The last organization opened, per browser, so sign in returns there. A convenience only: when
 * storage is unavailable the app opens the first organization instead.
 */
const KEY = 'tl-last-org';

export function readLastOrg(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeLastOrg(slug: string): void {
  try {
    localStorage.setItem(KEY, slug);
  } catch {
    // Storage blocked (private mode, policy): the fallback is the first organization.
  }
}
