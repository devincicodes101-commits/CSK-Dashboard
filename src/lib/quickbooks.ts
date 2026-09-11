/**
 * Talking to QuickBooks Online.
 *
 * Two differences from Jobber worth knowing before reading further.
 *
 * QBO identifies the company with a `realmId` that arrives on the callback
 * rather than being implied by the token, and every API call needs it. Lose
 * it and the tokens are useless, which is why oauth_connections has a column
 * for it.
 *
 * And its refresh tokens rotate too, but with a hard limit: a refresh token
 * lasts about 100 days and every refresh issues a new one. If nothing calls
 * the API for 100 days the connection dies of old age, no matter how healthy
 * it looked. The weekly sync keeps it alive on its own; a long quiet period
 * would not.
 *
 * Endpoints below are the documented ones. Confirm them against Intuit's
 * current docs before the first production connection — the same discipline
 * that caught the Jobber header being X-JOBBER-GRAPHQL-VERSION.
 */

import { loadTokens, saveTokens } from "./token-store";

export const QBO_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
export const QBO_TOKEN_URL =
  "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

/** Read-only accounting. Deliberately not the payments scope. */
export const QBO_SCOPE = "com.intuit.quickbooks.accounting";

export function apiBase(): string {
  return process.env.QBO_ENVIRONMENT?.trim() === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

/**
 * The callback address registered on the Intuit app.
 *
 * Exposed so the connect route can check it is starting the flow on the same
 * host the callback will return to — see canonical() there.
 */
export function redirectUri(): string {
  return env("QBO_REDIRECT_URI");
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env("QBO_CLIENT_ID"),
    scope: QBO_SCOPE,
    redirect_uri: env("QBO_REDIRECT_URI"),
    response_type: "code",
    state,
  });
  return `${QBO_AUTHORIZE_URL}?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/** Intuit wants the client credentials as Basic auth, not form fields. */
function basicAuth(): string {
  const pair = `${env("QBO_CLIENT_ID")}:${env("QBO_CLIENT_SECRET")}`;
  return `Basic ${Buffer.from(pair).toString("base64")}`;
}

async function tokenRequest(fields: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields),
  });

  if (!response.ok) {
    throw new Error(
      `QuickBooks token request failed (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as TokenResponse;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: env("QBO_REDIRECT_URI"),
  });
}

export async function saveConnection(
  tokens: TokenResponse,
  realmId: string,
): Promise<void> {
  await saveTokens("quickbooks", {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    // The realm is the company. Stored in connectedAccount so it survives
    // alongside the tokens; without it the tokens address nothing.
    connectedAccount: realmId,
  });
}

/**
 * A usable access token, refreshing if needed. Serialised, for the same
 * reason as Jobber's: parallel refreshes with a rotating token kill the
 * connection outright.
 */
let refreshInFlight: Promise<string> | null = null;

export async function accessToken(): Promise<string> {
  const stored = await loadTokens("quickbooks");
  if (!stored) {
    throw new Error(
      "QuickBooks is not connected. Open Settings and connect it first.",
    );
  }

  if (stored.expiresAt - Date.now() > 60_000) return stored.accessToken;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const refreshed = await tokenRequest({
          grant_type: "refresh_token",
          refresh_token: stored.refreshToken,
        });
        await saveConnection(refreshed, stored.connectedAccount ?? "");
        return refreshed.access_token;
      } catch (error) {
        /**
         * The same race Jobber has, and the same recovery. See accessToken in
         * jobber.ts for the full reasoning.
         *
         * Intuit rotates the refresh token on every use as well, so two server
         * instances refreshing a moment apart leave the loser holding a spent
         * token and a rejection, on a connection that is working fine. Look
         * again before declaring it dead: a refresh token that has changed
         * since we read it means somebody else rotated it, and their access
         * token is the live one.
         *
         * Any failure is worth re-checking here, not only a 401 — Intuit
         * answers a spent token with 400 invalid_grant as readily as 401, and
         * a wasted read beats a connection that needs reconnecting by hand.
         */
        const current = await loadTokens("quickbooks");
        const rotatedByAnother =
          current &&
          current.refreshToken !== stored.refreshToken &&
          current.expiresAt - Date.now() > 60_000;

        if (rotatedByAnother) return current.accessToken;
        throw error;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

/** The connected company id, needed on every request path. */
export async function realmId(): Promise<string> {
  const stored = await loadTokens("quickbooks");
  const realm = stored?.connectedAccount;
  if (!realm) {
    throw new Error(
      "No QuickBooks company id is stored. Reconnect QuickBooks — the id " +
        "arrives with the connection and the API cannot be called without it.",
    );
  }
  return realm;
}

/**
 * A QuickBooks API call, with Intuit's trace id kept on any failure.
 *
 * Every Intuit response carries an `intuit_tid` header identifying that exact
 * request in their systems. It is the first thing their support asks for, and
 * it is unrecoverable once the response is discarded — so it goes into the
 * error rather than being noticed as missing during an incident.
 */
export async function qboFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${apiBase()}/v3/company/${await realmId()}/${path}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${await accessToken()}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const tid = response.headers.get("intuit_tid") ?? "none";
    throw new Error(
      `QuickBooks returned ${response.status} for ${path} ` +
        `(intuit_tid ${tid}): ${await response.text()}`,
    );
  }

  return response;
}

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}
