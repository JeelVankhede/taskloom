import { notFound } from '../errors/domain-error.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An id argument that is not a uuid cannot name any row: NOT_FOUND, never a SQL cast error. */
export function assertId(id: string, what: string): string {
  if (!UUID.test(id)) throw notFound(what);
  return id;
}
