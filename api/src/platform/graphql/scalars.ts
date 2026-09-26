import { GraphQLError, GraphQLScalarType, Kind } from 'graphql';

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function parseDate(value: unknown): string {
  if (typeof value !== 'string' || !isCalendarDate(value)) {
    throw new GraphQLError('Date must be a calendar date in YYYY-MM-DD form');
  }
  return value;
}

/** Date is a YYYY-MM-DD string end to end, never converted through local time (7.3.2). */
export const DateScalar = new GraphQLScalarType({
  name: 'Date',
  serialize: (value) => {
    if (typeof value === 'string' && isCalendarDate(value)) return value;
    throw new GraphQLError('Date values must be YYYY-MM-DD strings');
  },
  parseValue: parseDate,
  parseLiteral: (ast) => parseDate(ast.kind === Kind.STRING ? ast.value : undefined),
});

export const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  serialize: (value) => {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return new Date(value).toISOString();
    throw new GraphQLError('DateTime values must be Date objects or ISO strings');
  },
  parseValue: (value) => {
    const date = typeof value === 'string' ? new Date(value) : undefined;
    if (!date || Number.isNaN(date.getTime())) throw new GraphQLError('Invalid DateTime');
    return date;
  },
});

/**
 * GraphQL enum values mapped to database values, so resolvers speak the database's language.
 * Priority NONE is 0 here and SQL NULL in the database (converted at the repository edge).
 */
export const ENUM_RESOLVERS = {
  Role: { OWNER: 'owner', ADMIN: 'admin', MEMBER: 'member', CONTRIBUTOR: 'contributor' },
  MembershipStatus: { ACTIVE: 'active', DEACTIVATED: 'deactivated' },
  JoinRequestStatus: {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    CANCELED: 'canceled',
  },
  Priority: { URGENT: 1, HIGH: 2, MEDIUM: 3, LOW: 4, NONE: 0 },
} as const;
