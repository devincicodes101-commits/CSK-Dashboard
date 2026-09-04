/**
 * Talking to Jobber.
 *
 * Endpoints, the version header and the field names in ./jobber-queries.ts
 * were all confirmed against Jobber's schema explorer on 5 September 2026,
 * API version 2025-04-16.
 */

import { serviceClient } from "./supabase";

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
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const { error } = await serviceClient()
    .from("oauth_connections")
    .upsert(
      {
        provider: "jobber",
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt.toISOString(),
        connected_account: connectedAccount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider" },
    );
  if (error) throw new Error(`Could not save the Jobber connection: ${error.message}`);
}

/**
 * A usable access token, refreshing first if it is close to expiry.
 *
 * Refreshed a minute early on purpose: a token that expires mid-sync fails
 * halfway through a week and leaves a partial snapshot, which is worse than
 * refreshing slightly too often.
 */
export async function accessToken(): Promise<string> {
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from("oauth_connections")
    .select("access_token, refresh_token, expires_at")
    .eq("provider", "jobber")
    .maybeSingle();

  if (error) throw new Error(`Could not read the Jobber connection: ${error.message}`);
  if (!data) {
    throw new Error(
      "Jobber is not connected. Open Settings and connect it before syncing.",
    );
  }

  const expiresAt = new Date(data.expires_at as string).getTime();
  if (expiresAt - Date.now() > 60_000) return data.access_token as string;

  const refreshed = await refreshTokens(data.refresh_token as string);
  await saveConnection(refreshed, null);
  return refreshed.access_token;
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

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}
