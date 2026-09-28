import type { BrowserContext, Route } from '@playwright/test';

interface Account {
  id: string;
  email: string;
  password: string;
  displayName: string;
  orgs: { slug: string; name: string }[];
}

/**
 * An in-memory stand-in for /auth and /graphql, installed on a browser context (all its tabs).
 * It enforces what the web client must respect: strict refresh rotation (reusing a rotated
 * token revokes the session, as the API does), HttpOnly cookie on Path=/auth, bearer tokens.
 */
export class FakeApi {
  readonly accounts = new Map<string, Account>();
  /** Live refresh token -> account id. A used token moves to `rotated`. */
  private readonly live = new Map<string, string>();
  private readonly rotated = new Set<string>();
  private readonly access = new Map<string, string>();
  private counter = 0;
  /** Every refresh token presented after it was rotated. The client must keep this empty. */
  readonly reuse: string[] = [];
  refreshCalls = 0;

  addAccount(account: Omit<Account, 'id' | 'orgs'> & { orgs?: Account['orgs'] }): void {
    const id = `user-${this.accounts.size + 1}`;
    this.accounts.set(account.email, { id, orgs: [], ...account });
  }

  async install(context: BrowserContext): Promise<void> {
    await context.route('**/auth/*', (route) => this.auth(route));
    await context.route('**/graphql', (route) => this.graphql(route));
  }

  private session(route: Route, account: Account, status = 200) {
    const refresh = `r${++this.counter}`;
    const accessToken = `a${this.counter}`;
    this.live.set(refresh, account.id);
    this.access.set(accessToken, account.id);
    return route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'set-cookie': `tl_refresh=${refresh}; Path=/auth; HttpOnly; SameSite=Strict` },
      body: JSON.stringify({
        accessToken,
        expiresIn: 900,
        user: { id: account.id, email: account.email, displayName: account.displayName },
      }),
    });
  }

  private error(route: Route, status: number, code: string) {
    return route.fulfill({
      status,
      contentType: 'application/json',
      headers: status === 401 ? { 'set-cookie': 'tl_refresh=; Path=/auth; Max-Age=0' } : {},
      body: JSON.stringify({ statusCode: status, code, message: code }),
    });
  }

  private byId(id: string | undefined): Account | undefined {
    return [...this.accounts.values()].find((a) => a.id === id);
  }

  private async auth(route: Route) {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const cookie = /tl_refresh=([^;]+)/.exec(request.headers()['cookie'] ?? '')?.[1];
    const body = request.postDataJSON() as {
      email: string;
      password: string;
      displayName: string;
    } | null;

    if (path === '/auth/signup') {
      if (this.accounts.has(body!.email)) return this.error(route, 409, 'EMAIL_TAKEN');
      this.addAccount({
        email: body!.email,
        password: body!.password,
        displayName: body!.displayName,
      });
      return this.session(route, this.accounts.get(body!.email)!, 201);
    }
    if (path === '/auth/signin') {
      const account = this.accounts.get(body!.email);
      if (!account || account.password !== body!.password) {
        return this.error(route, 401, 'INVALID_CREDENTIALS');
      }
      return this.session(route, account);
    }
    if (path === '/auth/refresh') {
      this.refreshCalls++;
      if (cookie && this.rotated.has(cookie)) {
        this.reuse.push(cookie);
        this.live.clear(); // strict rotation: the whole family is revoked
        return this.error(route, 401, 'UNAUTHENTICATED');
      }
      const account = this.byId(cookie ? this.live.get(cookie) : undefined);
      if (!account || !cookie) return this.error(route, 401, 'UNAUTHENTICATED');
      this.live.delete(cookie);
      this.rotated.add(cookie);
      // Hold the response briefly, so refreshes from several tabs would overlap if not serialized.
      await new Promise((resolve) => setTimeout(resolve, 150));
      return this.session(route, account);
    }
    if (path === '/auth/signout') {
      if (cookie) this.live.delete(cookie);
      return route.fulfill({
        status: 204,
        headers: { 'set-cookie': 'tl_refresh=; Path=/auth; Max-Age=0' },
      });
    }
    return this.error(route, 404, 'NOT_FOUND');
  }

  private graphql(route: Route) {
    const token = /^Bearer (.+)$/.exec(route.request().headers()['authorization'] ?? '')?.[1];
    const account = this.byId(token ? this.access.get(token) : undefined);
    if (!account) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [{ message: 'Unauthenticated', extensions: { code: 'UNAUTHENTICATED' } }],
        }),
      });
    }
    const { operationName } = route.request().postDataJSON() as { operationName: string };
    if (operationName !== 'Viewer') {
      throw new Error(`FakeApi: unexpected operation ${operationName}`);
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          viewer: {
            __typename: 'Viewer',
            id: account.id,
            email: account.email,
            displayName: account.displayName,
            memberships: account.orgs.map((o) => ({
              __typename: 'Membership',
              role: 'MEMBER',
              organization: { __typename: 'OrganizationSummary', id: `org-${o.slug}`, ...o },
            })),
          },
        },
      }),
    });
  }
}
