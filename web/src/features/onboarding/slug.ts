import { ORG_SLUG_PATTERN, ORG_SLUG_RESERVED } from '@taskloom/contracts';

/**
 * A slug suggested from an organization name: lowercase letters and digits, words joined by
 * hyphens, at most 6 characters. Empty when nothing valid comes out ("A", "!!!", "admin").
 */
export function suggestSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 6)
    .replace(/-+$/, '');
  return isValidSlug(slug) ? slug : '';
}

export function isValidSlug(slug: string): boolean {
  return ORG_SLUG_PATTERN.test(slug) && !(ORG_SLUG_RESERVED as readonly string[]).includes(slug);
}

export const SLUG_RULE = '3 to 6 lowercase letters or digits, with hyphens only inside';
