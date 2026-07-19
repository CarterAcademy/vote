import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";

import type { SessionUser } from "@/types";

import { ensureDatabaseReady } from "../db";
import { DomainError } from "../services/errors";

export const SESSION_COOKIE_NAME = "committee_vote_session";
const SESSION_ISSUER = "committee-vote";
const SESSION_AUDIENCE = "committee-vote-h5";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

interface SessionClaims {
  userId: string;
  dingtalkUserId: string;
  name: string;
  role: SessionUser["role"];
}

function getSecret(): Uint8Array {
  const configured = process.env.SESSION_SECRET?.trim();
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be configured in production");
  }
  if (
    process.env.NODE_ENV === "production" &&
    configured &&
    configured.length < 32
  ) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production");
  }

  return new TextEncoder().encode(
    configured ?? "local-demo-session-secret-change-before-production",
  );
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    userId: user.id,
    dingtalkUserId: user.dingtalkUserId,
    name: user.name,
    role: user.role,
  } satisfies SessionClaims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });

    if (
      typeof payload.userId !== "string" ||
      typeof payload.dingtalkUserId !== "string" ||
      typeof payload.name !== "string" ||
      (payload.role !== "HR" && payload.role !== "MEMBER")
    ) {
      return null;
    }

    return {
      id: payload.userId,
      dingtalkUserId: payload.dingtalkUserId,
      name: payload.name,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const claims = token ? await verifySessionToken(token) : null;
  if (!claims) return null;

  const db = await ensureDatabaseReady();
  const currentUser = await db
    .selectFrom("users")
    .select(["id", "dingtalk_user_id", "name", "role"])
    .where("id", "=", claims.id)
    .where("is_active", "=", true)
    .executeTakeFirst();
  if (!currentUser) return null;

  return {
    id: currentUser.id,
    dingtalkUserId: currentUser.dingtalk_user_id,
    name: currentUser.name,
    role: currentUser.role,
  };
});

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, await createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new DomainError("UNAUTHENTICATED", "请先登录钉钉后再操作");
  }
  return user;
}

export async function requireHr(user?: SessionUser): Promise<SessionUser> {
  const resolved = user ?? (await requireSessionUser());
  if (resolved.role !== "HR") {
    throw new DomainError("FORBIDDEN", "仅 HR 可以执行此操作");
  }
  return resolved;
}
