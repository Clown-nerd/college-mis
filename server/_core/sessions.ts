import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { jwtVerify, SignJWT } from "jose";
import { randomBytes } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

const developmentSecret = randomBytes(32);

function sessionSecret() {
  if (ENV.cookieSecret) return new TextEncoder().encode(ENV.cookieSecret);
  if (ENV.isProduction) throw new Error("JWT_SECRET must be configured in production.");
  return developmentSecret;
}

export async function createSessionToken(openId: string, expiresInMs = ONE_YEAR_MS) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(openId)
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + expiresInMs) / 1000))
    .sign(sessionSecret());
}

export async function authenticateRequest(req: Request): Promise<User> {
  const token = parseCookieHeader(req.headers.cookie ?? "")[COOKIE_NAME];
  if (!token) throw ForbiddenError("A valid sign-in session is required.");

  let openId: string;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || !payload.sub) throw new Error("Session subject is missing.");
    openId = payload.sub;
  } catch {
    throw ForbiddenError("The sign-in session is invalid or expired.");
  }

  const user = await db.getUserByOpenId(openId);
  if (!user) throw ForbiddenError("The account could not be found.");

  await db.upsertUser({ openId, lastSignedIn: new Date() });
  return user;
}
