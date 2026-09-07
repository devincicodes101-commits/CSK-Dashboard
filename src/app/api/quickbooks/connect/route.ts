import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/quickbooks";

/**
 * Starts the QuickBooks connection.
 *
 * Also serves as the Connect/Reconnect URL registered on Intuit's app, which
 * is the address they send a customer to when reconnecting from inside
 * QuickBooks itself.
 */
export async function GET() {
  const state = randomBytes(16).toString("hex");

  const response = NextResponse.redirect(authorizeUrl(state));
  response.cookies.set("qbo_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 1800,
  });
  return response;
}
