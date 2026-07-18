import type { SessionUser } from "@/types";

import { ensureDatabaseReady } from "../db";
import {
  getDingTalkGateway,
  type DingTalkGateway,
} from "../dingtalk";
import { DomainError } from "./errors";

export interface DemoUser extends SessionUser {
  department: string | null;
  committeeName: string | null;
}

function toSessionUser(row: {
  id: string;
  dingtalk_user_id: string;
  name: string;
  role: "HR" | "MEMBER";
}): SessionUser {
  return {
    id: row.id,
    dingtalkUserId: row.dingtalk_user_id,
    name: row.name,
    role: row.role,
  };
}

export async function getUserById(userId: string): Promise<SessionUser | null> {
  const db = await ensureDatabaseReady();
  const row = await db
    .selectFrom("users")
    .select(["id", "dingtalk_user_id", "name", "role"])
    .where("id", "=", userId)
    .where("is_active", "=", true)
    .executeTakeFirst();

  return row ? toSessionUser(row) : null;
}

export async function getUserByDingTalkUserId(
  dingtalkUserId: string,
): Promise<SessionUser | null> {
  const db = await ensureDatabaseReady();
  const row = await db
    .selectFrom("users")
    .select(["id", "dingtalk_user_id", "name", "role"])
    .where("dingtalk_user_id", "=", dingtalkUserId)
    .where("is_active", "=", true)
    .executeTakeFirst();

  return row ? toSessionUser(row) : null;
}

export async function listDemoUsers(): Promise<DemoUser[]> {
  const db = await ensureDatabaseReady();
  const rows = await db
    .selectFrom("users")
    .leftJoin("committee_members", (join) =>
      join
        .onRef("committee_members.user_id", "=", "users.id")
        .on("committee_members.is_active", "=", true),
    )
    .leftJoin("committees", "committees.id", "committee_members.committee_id")
    .select([
      "users.id",
      "users.dingtalk_user_id",
      "users.name",
      "users.department",
      "users.role",
      "committees.name as committee_name",
    ])
    .where("users.is_active", "=", true)
    .orderBy("users.role", "asc")
    .orderBy("committee_members.display_order", "asc")
    .execute();

  return rows.map((row) => ({
    ...toSessionUser(row),
    department: row.department,
    committeeName: row.committee_name ?? null,
  }));
}

export async function authenticateDingTalkCode(
  authCode: string,
  gateway: DingTalkGateway = getDingTalkGateway(),
): Promise<SessionUser> {
  let dingtalkUserId: string;
  try {
    const identity = await gateway.exchangeAuthCode(authCode);
    dingtalkUserId = identity.userId;
  } catch (error) {
    throw new DomainError(
      "DINGTALK_ERROR",
      "钉钉身份验证失败，请重新进入应用",
      error instanceof Error ? { cause: error.message } : undefined,
    );
  }

  const user = await getUserByDingTalkUserId(dingtalkUserId);
  if (!user) {
    throw new DomainError(
      "FORBIDDEN",
      "当前钉钉账号不在本系统的 HR 或委员名单中",
    );
  }

  return user;
}
