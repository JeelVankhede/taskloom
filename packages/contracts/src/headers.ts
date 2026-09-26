/** The selected organization id, sent with every org-scoped GraphQL request. */
export const ORG_HEADER = 'x-org-id';
/** Correlation id; generated when absent and echoed back. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** The refresh token cookie: HttpOnly, SameSite=Strict, Path=/auth. */
export const REFRESH_COOKIE = 'tl_refresh';

/** Access token claims checked on every request. */
export const TOKEN_ISSUER = 'taskloom-api';
export const TOKEN_AUDIENCE = 'taskloom-web';
