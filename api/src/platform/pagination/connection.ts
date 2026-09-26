import { PAGE_SIZE_DEFAULT } from '@taskloom/contracts';
import { validationFailed } from '../errors/domain-error.js';

export interface Connection<T> {
  edges: { cursor: string; node: T }[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

/** Opaque cursor: base64url of the sort key values (design reference 7.3.6). */
export function encodeCursor(values: readonly (string | number)[]): string {
  return Buffer.from(JSON.stringify(values)).toString('base64url');
}

/** Decodes a cursor made of `types.length` values of the given primitive types. */
export function decodeCursor(
  cursor: string,
  types: readonly ('string' | 'number')[],
): (string | number)[] {
  let values: unknown;
  try {
    values = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw validationFailed('Invalid cursor');
  }
  if (
    !Array.isArray(values) ||
    values.length !== types.length ||
    values.some((v, i) => typeof v !== types[i])
  ) {
    throw validationFailed('Invalid cursor');
  }
  return values as (string | number)[];
}

export const pageSize = (first: number | null | undefined) => first ?? PAGE_SIZE_DEFAULT;

/** Builds a connection from `first + 1` fetched rows, so hasNextPage needs no count query. */
export function toConnection<T>(
  rows: T[],
  first: number,
  keyOf: (row: T) => (string | number)[],
): Connection<T> {
  const page = rows.slice(0, first);
  const edges = page.map((node) => ({ cursor: encodeCursor(keyOf(node)), node }));
  return {
    edges,
    pageInfo: { hasNextPage: rows.length > first, endCursor: edges.at(-1)?.cursor ?? null },
  };
}
