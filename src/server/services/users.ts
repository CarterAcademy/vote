import { randomUUID } from "node:crypto";

import type { SessionUser } from "@/types";

import {
  addInitiatorSchema,
  updateInitiatorSchema,
  type AddInitiatorInput,
  type UpdateInitiatorInput,
} from "../validation";

import { ensureDatabaseReady } from "../db";
import {
  getDingTalkGateway,
  type DingTalkGateway,
} from "../dingtalk";
import { DomainError } from "./errors";
import { assertHr, toIso, writeAuditLog } from "./common";

export interface InitiatorDto {
  id: string;
  dingtalkUserId: string;
  name: string;
  department: string | null;
  isActive: boolean;
  pollCount: number;
  createdAt: string;
}

function mapInitiator(row: {
  id: string;
  dingtalk_user_id: string;
  name: string;
  department: string | null;
  is_active: boolean;
  poll_count: string | number | bigint;
  created_at: Date | string;
}): InitiatorDto {
  return {
    id: row.id,
    dingtalkUserId: row.dingtalk_user_id,
    name: row.name,
    department: row.department,
    isActive: row.is_active,
    pollCount: Number(row.poll_count),
    createdAt: toIso(row.created_at),
  };
}

async function getInitiatorById(userId: string): Promise<InitiatorDto> {
  const db = await ensureDatabaseReady();
  const row = await db
    .selectFrom("users")
    .leftJoin("polls", "polls.created_by_user_id", "users.id")
    .select([
      "users.id",
      "users.dingtalk_user_id",
      "users.name",
      "users.department",
      "users.is_active",
      "users.created_at",
      (expression) => expression.fn.count("polls.id").as("poll_count"),
    ])
    .where("users.id", "=", userId)
    .where("users.role", "=", "HR")
    .groupBy([
      "users.id",
      "users.dingtalk_user_id",
      "users.name",
      "users.department",
      "users.is_active",
      "users.created_at",
    ])
    .executeTakeFirst();
  if (!row) throw new DomainError("NOT_FOUND", "发起人不存在");
  return mapInitiator(row);
}

export async function listInitiators(actor: SessionUser): Promise<InitiatorDto[]> {
  assertHr(actor);
  const db = await ensureDatabaseReady();
  const rows = await db
    .selectFrom("users")
    .leftJoin("polls", "polls.created_by_user_id", "users.id")
    .select([
      "users.id",
      "users.dingtalk_user_id",
      "users.name",
      "users.department",
      "users.is_active",
      "users.created_at",
      (expression) => expression.fn.count("polls.id").as("poll_count"),
    ])
    .where("users.role", "=", "HR")
    .groupBy([
      "users.id",
      "users.dingtalk_user_id",
      "users.name",
      "users.department",
      "users.is_active",
      "users.created_at",
    ])
    .orderBy("users.is_active", "desc")
    .orderBy("users.created_at", "asc")
    .execute();
  return rows.map(mapInitiator);
}

export async function addInitiator(
  input: AddInitiatorInput | unknown,
  actor: SessionUser,
): Promise<InitiatorDto> {
  assertHr(actor);
  const parsed = addInitiatorSchema.parse(input);
  const db = await ensureDatabaseReady();
  const userId = await db.transaction().execute(async (transaction) => {
    const existing = await transaction
      .selectFrom("users")
      .select(["id", "role", "is_active"])
      .where("dingtalk_user_id", "=", parsed.dingtalkUserId)
      .executeTakeFirst();

    if (existing?.role === "HR" && existing.is_active) {
      throw new DomainError("CONFLICT", "该发起人已存在");
    }

    const id = existing?.id ?? randomUUID();
    if (existing) {
      await transaction
        .updateTable("users")
        .set({
          name: parsed.name,
          department: parsed.department?.trim() || null,
          role: "HR",
          is_active: true,
          updated_at: new Date(),
        })
        .where("id", "=", id)
        .execute();
    } else {
      await transaction
        .insertInto("users")
        .values({
          id,
          dingtalk_user_id: parsed.dingtalkUserId,
          name: parsed.name,
          department: parsed.department?.trim() || null,
          role: "HR",
        })
        .execute();
    }

    await writeAuditLog(transaction, {
      actorUserId: actor.id,
      action: existing ? "INITIATOR_REACTIVATED" : "INITIATOR_ADDED",
      entityType: "USER",
      entityId: id,
      details: { name: parsed.name, dingtalkUserId: parsed.dingtalkUserId },
    });
    return id;
  });
  return getInitiatorById(userId);
}

export async function updateInitiator(
  initiatorId: string,
  input: UpdateInitiatorInput | unknown,
  actor: SessionUser,
): Promise<InitiatorDto> {
  assertHr(actor);
  const parsed = updateInitiatorSchema.parse(input);
  if (!parsed.isActive && initiatorId === actor.id) {
    throw new DomainError("CONFLICT", "不能停用当前登录的发起人账号");
  }

  const db = await ensureDatabaseReady();
  await db.transaction().execute(async (transaction) => {
    const target = await transaction
      .selectFrom("users")
      .select(["id", "name", "is_active"])
      .where("id", "=", initiatorId)
      .where("role", "=", "HR")
      .executeTakeFirst();
    if (!target) throw new DomainError("NOT_FOUND", "发起人不存在");
    if (target.is_active === parsed.isActive) return;

    if (!parsed.isActive) {
      const active = await transaction
        .selectFrom("users")
        .select((expression) => expression.fn.countAll().as("count"))
        .where("role", "=", "HR")
        .where("is_active", "=", true)
        .executeTakeFirstOrThrow();
      if (Number(active.count) <= 1) {
        throw new DomainError("CONFLICT", "至少需要保留一名启用中的发起人");
      }
    }

    await transaction
      .updateTable("users")
      .set({ is_active: parsed.isActive, updated_at: new Date() })
      .where("id", "=", initiatorId)
      .execute();
    await writeAuditLog(transaction, {
      actorUserId: actor.id,
      action: parsed.isActive ? "INITIATOR_REACTIVATED" : "INITIATOR_DEACTIVATED",
      entityType: "USER",
      entityId: initiatorId,
      details: { name: target.name },
    });
  });
  return getInitiatorById(initiatorId);
}

export interface DemoUser extends SessionUser {
  department: string | null;
  committeeName: string | null;
}

function toSessionUser(row: {
  id: string;
  dingtalk_user_id: string;
  name: string;
  role: "HR" | "MEMBER";
  committee_name?: string | null;
}): SessionUser {
  return {
    id: row.id,
    dingtalkUserId: row.dingtalk_user_id,
    name: row.name,
    role: row.role,
    isCommitteeMember: row.role === "MEMBER" || Boolean(row.committee_name),
  };
}

export async function getUserById(userId: string): Promise<SessionUser | null> {
  const db = await ensureDatabaseReady();
  const row = await db
    .selectFrom("users")
    .leftJoin("committee_members", (join) =>
      join
        .onRef("committee_members.user_id", "=", "users.id")
        .on("committee_members.is_active", "=", true),
    )
    .leftJoin("committees", "committees.id", "committee_members.committee_id")
    .select(["users.id", "users.dingtalk_user_id", "users.name", "users.role", "committees.name as committee_name"])
    .where("users.id", "=", userId)
    .where("users.is_active", "=", true)
    .executeTakeFirst();

  return row ? toSessionUser(row) : null;
}

export async function getUserByDingTalkUserId(
  dingtalkUserId: string,
): Promise<SessionUser | null> {
  const db = await ensureDatabaseReady();
  const row = await db
    .selectFrom("users")
    .leftJoin("committee_members", (join) =>
      join
        .onRef("committee_members.user_id", "=", "users.id")
        .on("committee_members.is_active", "=", true),
    )
    .leftJoin("committees", "committees.id", "committee_members.committee_id")
    .select(["users.id", "users.dingtalk_user_id", "users.name", "users.role", "committees.name as committee_name"])
    .where("users.dingtalk_user_id", "=", dingtalkUserId)
    .where("users.is_active", "=", true)
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
  let identity: Awaited<ReturnType<DingTalkGateway["exchangeAuthCode"]>>;
  try {
    identity = await gateway.exchangeAuthCode(authCode);
  } catch (error) {
    throw new DomainError(
      "DINGTALK_ERROR",
      "钉钉身份验证失败，请重新进入应用",
      error instanceof Error ? { cause: error.message } : undefined,
    );
  }

  const user = await getUserByDingTalkUserId(identity.userId);
  if (!user) {
    throw new DomainError(
      "FORBIDDEN",
      "当前钉钉账号不在本系统的 HR 或委员名单中",
    );
  }

  if (identity.name || identity.department) {
    const db = await ensureDatabaseReady();
    await db
      .updateTable("users")
      .set({
        ...(identity.name ? { name: identity.name } : {}),
        ...(identity.department ? { department: identity.department } : {}),
        updated_at: new Date(),
      })
      .where("id", "=", user.id)
      .execute();
  }

  return identity.name ? { ...user, name: identity.name } : user;
}

export async function authenticateDingTalkWebCode(
  authCode: string,
  gateway: DingTalkGateway = getDingTalkGateway(),
): Promise<SessionUser> {
  let identity: Awaited<ReturnType<DingTalkGateway["exchangeWebAuthCode"]>>;
  try {
    identity = await gateway.exchangeWebAuthCode(authCode);
  } catch (error) {
    throw new DomainError(
      "DINGTALK_ERROR",
      "钉钉网页身份验证失败，请重新登录",
      error instanceof Error ? { cause: error.message } : undefined,
    );
  }

  const user = await getUserByDingTalkUserId(identity.userId);
  if (!user) {
    throw new DomainError(
      "FORBIDDEN",
      "当前钉钉账号不在本系统的 HR 或委员名单中",
    );
  }

  if (identity.name || identity.department) {
    const db = await ensureDatabaseReady();
    await db
      .updateTable("users")
      .set({
        ...(identity.name ? { name: identity.name } : {}),
        ...(identity.department ? { department: identity.department } : {}),
        updated_at: new Date(),
      })
      .where("id", "=", user.id)
      .execute();
  }

  return identity.name ? { ...user, name: identity.name } : user;
}
