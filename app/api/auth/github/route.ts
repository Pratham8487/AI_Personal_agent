import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import {
  buildSignInUrl,
  githubSignInConfigured,
  GITHUB_OAUTH_STATE_COOKIE,
} from "@/lib/server/github-signin";

export async function GET(request: Request) {
  if (!githubSignInConfigured()) {
    return Response.redirect(new URL("/sign-in?error=github_not_configured", request.url));
  }
  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(GITHUB_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  const origin = new URL(request.url).origin;
  return Response.redirect(buildSignInUrl(origin, state));
}
