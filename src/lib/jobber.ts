/**
 * Talking to Jobber.
 *
 * Endpoints, the version header and the field names in ./jobber-queries.ts
 * were all confirmed against Jobber's schema explorer on 5 September 2026,
 * API version 2025-04-16.
 */

import { TokenExpired, backend, loadTokens, saveTokens } from "./token-store";

export const JOBBER_AUTHORIZE_URL = "https://api.getjobber.com/api/oauth/authorize";
export const JOBBER_TOKEN_URL = "https://api.getjobber.com/api/oauth/token";
export const JOBBER_GRAPHQL_URL = "https://api.getjobber.com/api/graphql";

/**
 * Jobber pins breaking changes behind a dated version header. Set it once and
 * leave it: an unpinned client silently changes shape when they ship.
 *
 * Taken from the Headers pane of Jobber's own GraphiQL console on 5 Sep 2026,
 * which is also where the exact header name came from — it is
 * X-JOBBER-GRAPHQL-VERSION, not the run-together spelling.
 */
export const JOBBER_API_VERSION = "2025-04-16";

/* ------------------------------------------------------------------- oauth */

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env("JOBBER_CLIENT_ID"),
    redirect_uri: env("JOBBER_REDIRECT_URI"),
    response_type: "code",
    state,
  });
  return `${JOBBER_AUTHORIZE_URL}?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: env("JOBBER_REDIRECT_URI"),
  });
}

export async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

async function tokenRequest(fields: Record<string, string>): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: env("JOBBER_CLIENT_ID"),
    client_secret: env("JOBBER_CLIENT_SECRET"),
    ...fields,
  });

  const response = await fetch(JOBBER_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    // The body carries the real reason — almost always a redirect_uri that
    // does not match the one registered on the app, down to a trailing slash.
    throw new Error(
      `Jobber token request failed (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as TokenResponse;
}

/* ----------------------------------------------------------- token storage */

export async function saveConnection(
  tokens: TokenResponse,
  connectedAccount: string | null,
): Promise<void> {
  await saveTokens("jobber", {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    connectedAccount,
  });
}

/**
 * A usable access token, refreshing first if it is close to expiry.
 *
 * Refreshed a minute early on purpose: a token that expires mid-sync fails
 * halfway through a week and leaves a partial snapshot, which is worse than
 * refreshing slightly too often.
 *
 * Jobber has refresh token rotation switched on, so each refresh invalidates
 * the one it replaced. That has a consequence worth remembering before adding
 * a manual "sync now" button: two refreshes racing each other will break the
 * connection outright, because the loser is holding a token that no longer
 * exists. One scheduled job is safe; two concurrent callers are not.
 */
export async function accessToken(): Promise<string> {
  const stored = await loadTokens("jobber");
  if (!stored) {
    throw new Error(
      "Jobber is not connected. Open Settings and connect it before syncing.",
    );
  }

  if (stored.expiresAt - Date.now() > 60_000) return stored.accessToken;

  // On browser-session storage a refresh cannot be written back from here:
  // only a route handler may set a cookie. Jobber rotates its refresh token,
  // so refreshing without saving the replacement breaks the connection
  // permanently. Say so, and let the caller redirect through the route that
  // can save it.
  if (backend() === "cookie") throw new TokenExpired();

  const refreshed = await refreshTokens(stored.refreshToken);
  await saveConnection(refreshed, stored.connectedAccount);
  return refreshed.access_token;
}

/**
 * Refresh and persist, for callers that CAN write — the refresh route.
 *
 * Returns the account name carried through from the previous tokens, so a
 * refresh does not quietly forget whose Jobber this is.
 */
export async function refreshAndSave(): Promise<void> {
  const stored = await loadTokens("jobber");
  if (!stored) throw new Error("Jobber is not connected.");
  const refreshed = await refreshTokens(stored.refreshToken);
  await saveConnection(refreshed, stored.connectedAccount);
}

/* ----------------------------------------------------------------- graphql */

export interface GraphQLError {
  message: string;
}

export async function graphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(JOBBER_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      "X-JOBBER-GRAPHQL-VERSION": JOBBER_API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Jobber API returned ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as { data?: T; errors?: GraphQLError[] };

  // GraphQL answers 200 with an errors array. Treat that as a failure rather
  // than reading a partial `data` object, or a missing field becomes a zero.
  if (payload.errors?.length) {
    throw new Error(
      `Jobber API errors: ${payload.errors.map((e) => e.message).join("; ")}`,
    );
  }
  if (!payload.data) throw new Error("Jobber API returned no data.");
  return payload.data;
}

/**
 * Walks a Relay-style connection to the end.
 *
 * Every list in Jobber is paginated. Taking only the first page is the classic
 * way to under-report a busy week and never notice, so pagination is handled
 * here once rather than at each call site.
 */
export async function paginate<Node>(
  query: string,
  variables: Record<string, unknown>,
  pick: (data: never) => {
    nodes: Node[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  },
): Promise<Node[]> {
  const all: Node[] = [];
  let after: string | null = null;

  for (let page = 0; page < 100; page += 1) {
    const data = await graphql<never>(query, { ...variables, after });
    const connection = pick(data);
    all.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) return all;
    after = connection.pageInfo.endCursor;
  }
  throw new Error(
    "Stopped after 100 pages from Jobber. That is far more than a week should " +
      "ever produce, so the date filter is probably not being applied.",
  );
}

/* ------------------------------------------------------------------ helper */

/**
 * An environment variable, trimmed.
 *
 * The trim is not tidiness. Pasting a URL into a hosting dashboard very
 * easily carries a trailing newline, and OAuth compares redirect URIs byte
 * for byte: a stray 
 fails with
 *
 *   The provided redirect URI "https://.../api/jobber/callback
" isn't valid
 *
 * which is only diagnosable if you notice the escape sequence inside the
 * quotes. The same paste into the client secret fails as `invalid_client`,
 * which says nothing at all. Trimming here costs nothing and removes a whole
 * category of confusing failure.
 */
function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}
