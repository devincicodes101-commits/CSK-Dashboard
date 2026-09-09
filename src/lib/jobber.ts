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
/**
 * DO NOT BUMP THIS WITHOUT RE-RUNNING scripts/test-metrics.mts AGAINST LIVE DATA.
 *
 * Confirmed on 9 September 2026, against CSK's own account: under version
 * 2026-05-12 the `sentAt` quote filter returns NOTHING. Not an error — an
 * empty list. Asked for every quote sent since 2020 it answered zero, on an
 * account holding 1,057 quotes whose sentAt fields are plainly populated.
 * Under 2025-04-16 the same query returns the expected quotes.
 *
 * So a version bump would have taken Quotes Sent to 0, and with it the win
 * rate, silently and plausibly. That is the exact failure this dashboard
 * exists to prevent, which is why the version is pinned rather than tracking
 * whatever Jobber ships. syncWeek carries a matching coherence check.
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

/** The stored refresh token has been spent. Only reconnecting fixes it. */
export class ConnectionLost extends Error {
  constructor() {
    super(
      "The Jobber connection has expired. Open Settings and click Reconnect — " +
        "it takes a few seconds and nothing else needs changing.",
    );
    this.name = "ConnectionLost";
  }
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
    const body = await response.text();

    // A 401 on a refresh is not a transient failure. Jobber rotates its
    // refresh token on every use, so a rejected one means the stored token
    // has already been spent and no retry will help — the connection has to
    // be made again. Say that, rather than showing the raw 401 to someone who
    // then has no idea what to do about it.
    if (response.status === 401 && fields.grant_type === "refresh_token") {
      throw new ConnectionLost();
    }

    // Otherwise the body carries the real reason — almost always a
    // redirect_uri that does not match the one registered on the app, down to
    // a trailing slash.
    throw new Error(`Jobber token request failed (${response.status}): ${body}`);
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
 * At most one refresh in flight at a time.
 *
 * syncWeek fires five queries in parallel and each asks for a token. With an
 * expired token that meant five simultaneous refreshes using the same refresh
 * token — Jobber accepts the first and rejects the rest, and in the scramble
 * the surviving token can fail to be saved, which kills the connection
 * outright and needs a manual reconnect.
 *
 * Callers arriving while a refresh is running wait for that one instead of
 * starting their own. Module scope, so this covers one serverless instance;
 * two instances refreshing at the same moment is far rarer and no longer the
 * common case.
 */
let refreshInFlight: Promise<string> | null = null;

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

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const refreshed = await refreshTokens(stored.refreshToken);
        // Save BEFORE returning. A token handed out but not stored is the
        // failure that ends with a dead connection.
        await saveConnection(refreshed, stored.connectedAccount);
        return refreshed.access_token;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
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
  attempt = 0,
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
    const messages = payload.errors.map((e) => e.message).join("; ");

    // Throttling is not an error so much as "later". Jobber restores its
    // budget at 500 points a second, so a short wait clears it. Retrying is
    // far better than handing back a half-empty week.
    if (/throttl/i.test(messages) && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
      return graphql<T>(query, variables, attempt + 1);
    }

    throw new Error(`Jobber API errors: ${messages}`);
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
