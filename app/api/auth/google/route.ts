import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import {
  buildSignInUrl,
  googleSignInConfigured,
  OAUTH_STATE_COOKIE,
} from "@/lib/server/google-signin";

export async function GET(request: Request) {
  if (!googleSignInConfigured()) {
    return Response.redirect(new URL("/sign-in?error=google_not_configured", request.url));
  }
  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  const origin = new URL(request.url).origin;
  return Response.redirect(buildSignInUrl(origin, state));
}
