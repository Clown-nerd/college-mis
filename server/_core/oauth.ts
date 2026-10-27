import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import * as db from "../db";
import { localAuthEnabled } from "../localAuth";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { createSessionToken } from "./sessions";

const STATE_COOKIE = "college_oauth_state";
const VERIFIER_COOKIE = "college_oauth_verifier";
const LOGIN_COOKIE_OPTIONS = { httpOnly: true, path: "/", sameSite: "lax" as const, secure: ENV.isProduction };

function redirectUrl(req: Request) {
  if (ENV.oauthRedirectUrl) return ENV.oauthRedirectUrl;
  if (ENV.isProduction) throw new Error("OAUTH_REDIRECT_URL must be configured in production.");
  return `${req.protocol}://${req.get("host")}/api/oauth/callback`;
}

function isOAuthConfigured() {
  const values = [ENV.oauthAuthorizationUrl, ENV.oauthTokenUrl, ENV.oauthUserInfoUrl, ENV.oauthClientId];
  return values.every(value => Boolean(value));
}

function requireOAuthConfiguration() {
  if (!isOAuthConfigured()) {
    throw new Error("Configure the OAuth authorization, token, user-info, and client ID settings.");
  }
}

function equalSecret(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/start", async (req: Request, res: Response) => {
    if (!isOAuthConfigured()) {
      if (localAuthEnabled()) {
        try {
          const requestedRole = typeof req.query.role === "string" ? req.query.role : "admin";
          const allowedRoles: db.LocalIdentityRole[] = ["applicant", "student", "faculty", "non_teaching", "finance", "registrar", "admin"];
          const role = allowedRoles.includes(requestedRole as db.LocalIdentityRole)
            ? (requestedRole as db.LocalIdentityRole)
            : "admin";
          const user = await db.getOrCreateLocalUser(role);
          const session = await createSessionToken(user.openId);
          res.cookie(COOKIE_NAME, session, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
          res.redirect(302, "/");
          return;
        } catch {
          res.redirect(302, "/");
          return;
        }
      }
      res.status(503).send("Institutional sign-in is not configured.");
      return;
    }

    try {
      const state = randomBytes(32).toString("base64url");
      const verifier = randomBytes(48).toString("base64url");
      const authorization = new URL(ENV.oauthAuthorizationUrl);
      authorization.searchParams.set("response_type", "code");
      authorization.searchParams.set("client_id", ENV.oauthClientId);
      authorization.searchParams.set("redirect_uri", redirectUrl(req));
      authorization.searchParams.set("scope", ENV.oauthScope);
      authorization.searchParams.set("state", state);
      authorization.searchParams.set("code_challenge", pkceChallenge(verifier));
      authorization.searchParams.set("code_challenge_method", "S256");

      res.cookie(STATE_COOKIE, state, { ...LOGIN_COOKIE_OPTIONS, maxAge: 10 * 60 * 1000 });
      res.cookie(VERIFIER_COOKIE, verifier, { ...LOGIN_COOKIE_OPTIONS, maxAge: 10 * 60 * 1000 });
      res.redirect(302, authorization.toString());
    } catch {
      res.status(503).send("Institutional sign-in is not configured.");
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const verifier = cookies[VERIFIER_COOKIE];
    res.clearCookie(STATE_COOKIE, LOGIN_COOKIE_OPTIONS);
    res.clearCookie(VERIFIER_COOKIE, LOGIN_COOKIE_OPTIONS);

    if (!code || !equalSecret(state, cookies[STATE_COOKIE]) || !verifier) {
      res.status(400).send("The sign-in response could not be verified. Please try again.");
      return;
    }

    try {
      requireOAuthConfiguration();
      const tokenResponse = await fetch(ENV.oauthTokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUrl(req),
          client_id: ENV.oauthClientId,
          ...(ENV.oauthClientSecret ? { client_secret: ENV.oauthClientSecret } : {}),
          code_verifier: verifier,
        }),
      });
      if (!tokenResponse.ok) throw new Error(`Token exchange failed (${tokenResponse.status}).`);
      const token = await tokenResponse.json() as { access_token?: string };
      if (!token.access_token) throw new Error("Token response did not include an access token.");

      const profileResponse = await fetch(ENV.oauthUserInfoUrl, {
        headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" },
      });
      if (!profileResponse.ok) throw new Error(`Profile lookup failed (${profileResponse.status}).`);
      const profile = await profileResponse.json() as { sub?: string; name?: string; email?: string; preferred_username?: string };
      if (!profile.sub) throw new Error("The identity provider did not return a subject identifier.");

      const namespace = ENV.oauthSubjectNamespace || new URL(ENV.oauthUserInfoUrl).origin;
      const openId = createHash("sha256").update(`${namespace}\n${profile.sub}`).digest("hex");
      const email = profile.email?.trim().toLowerCase() || null;
      await db.upsertUser({
        openId,
        name: profile.name || profile.preferred_username || email,
        email,
        loginMethod: "oauth",
        lastSignedIn: new Date(),
      });

      const session = await createSessionToken(openId);
      res.cookie(COOKIE_NAME, session, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed:", error);
      res.status(500).send("Sign-in failed. Please try again or contact the system administrator.");
    }
  });
}
