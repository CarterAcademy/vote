import { randomUUID } from "node:crypto";

import type { SessionUser } from "@/types";

import { ensureDatabaseReady } from "../db";
import {
  addCommitteeMemberSchema,
  type AddCommitteeMemberInput,
} from "../validation";
import { assertHr, toIso, writeAuditLog } from "./common";
import { DomainError } from "./errors";

export interface CommitteeMemberDto {
  id: string;
  userId: string;
  dingtalkUserId: string;
  name: string;
  department: string | null;
  position: string | null;
  joinedAt: string;
}

function mapMember(row: {
  id: string;
  user_id: string;
  dingtalk_user_id: string;
  name: string;
  department: string | null;
  position: string | null;
  joined_at: Date | string;
}): CommitteeMemberDto {
  return {
    id: row.id,
    userId: row.user_id,
    dingtalkUserId: row.dingtalk_user_id,
    name: row.name,
    department: row.department,
    position: row.position,
    joinedAt: toIso(row.joined_at),
  };
}

async function assertCommitteeExists(committeeId: string): Promise<void> {
  const db = await ensureDatabaseReady();
  const committee = await db
    .selectFrom("committees")
    .select("id")
    .where("id", "=", committeeId)
    .executeTakeFirst();
  if (!committee) throw new DomainError("NOT_FOUND", "委员会不存在");
}

export async function listCommitteeMembers(
  committeeId: string,
): Promise<CommitteeMemberDto[]> {
  await assertCommitteeExists(committeeId);
  const db = await ensureDatabaseReady();
  const rows = await db
    .selectFrom("committee_members")
    .innerJoin("users", "users.id", "committee_members.user_id")
    .select([
      "committee_members.id",
      "committee_members.user_id",
      "users.dingtalk_user_id",
      "users.name",
      "users.department",
      "committee_members.position",
      "committee_members.joined_at",
    ])
    .where("committee_members.committee_id", "=", committeeId)
    .where("committee_members.is_active", "=", true)
    .where("users.is_active", "=", true)
    .orderBy("committee_members.display_order", "asc")
    .execute();

  return rows.map(mapMember);
}

export async function addCommitteeMember(
  committeeId: string,
  input: AddCommitteeMemberInput | unknown,
  actor: SessionUser,
): Promise<CommitteeMemberDto> {
  assertHr(actor);
  const parsed = addCommitteeMemberSchema.parse(input);
  const db = await ensureDatabaseReady();

  return db.transaction().execute(async (transaction) => {
    const committee = await transaction
      .selectFrom("committees")
      .select(["id", "name"])
      .where("id", "=", committeeId)
      .executeTakeFirst();
    if (!committee) throw new DomainError("NOT_FOUND", "委员会不存在");

    let user = await transaction
      .selectFrom("users")
      .select(["id", "dingtalk_user_id", "name", "department"])
      .where("dingtalk_user_id", "=", parsed.dingtalkUserId)
      .executeTakeFirst();

    if (!user) {
      const userId = randomUUID();
      await transaction
        .insertInto("users")
        .values({
          id: userId,
          dingtalk_user_id: parsed.dingtalkUserId,
          name: parsed.name,
          department: parsed.department?.trim() || null,
          role: "MEMBER",
        })
        .execute();
      user = {
        id: userId,
        dingtalk_user_id: parsed.dingtalkUserId,
        name: parsed.name,
        department: parsed.department?.trim() || null,
      };
    } else {
      await transaction
        .updateTable("users")
        .set({
          name: parsed.name,
          department: parsed.department?.trim() || user.department,
          is_active: true,
          updated_at: new Date(),
        })
        .where("id", "=", user.id)
        .execute();
    }

    const existing = await transaction
      .selectFrom("committee_members")
      .select(["id", "is_active"])
      .where("committee_id", "=", committeeId)
      .where("user_id", "=", user.id)
      .executeTakeFirst();
    if (existing?.is_active) {
      throw new DomainError("CONFLICT", `${parsed.name} 已在该委员会中`);
    }

    const lastMember = await transaction
      .selectFrom("committee_members")
      .select("display_order")
      .where("committee_id", "=", committeeId)
      .orderBy("display_order", "desc")
      .executeTakeFirst();
    const memberId = existing?.id ?? randomUUID();
    const position = parsed.position?.trim() || "委员";

    if (existing) {
      await transaction
        .updateTable("committee_members")
        .set({
          is_active: true,
          position,
          display_order: (lastMember?.display_order ?? 0) + 1,
          joined_at: new Date(),
        })
        .where("id", "=", existing.id)
        .execute();
    } else {
      await transaction
        .insertInto("committee_members")
        .values({
          id: memberId,
          committee_id: committeeId,
          user_id: user.id,
          position,
          display_order: (lastMember?.display_order ?? 0) + 1,
        })
        .execute();
    }

    await writeAuditLog(transaction, {
      actorUserId: actor.id,
      action: "COMMITTEE_MEMBER_ADDED",
      entityType: "COMMITTEE",
      entityId: committeeId,
      details: { memberId, userId: user.id, name: parsed.name, committeeName: committee.name },
    });

    const row = await transaction
      .selectFrom("committee_members")
      .innerJoin("users", "users.id", "committee_members.user_id")
      .select([
        "committee_members.id",
        "committee_members.user_id",
        "users.dingtalk_user_id",
        "users.name",
        "users.department",
        "committee_members.position",
        "committee_members.joined_at",
      ])
      .where("committee_members.id", "=", memberId)
      .executeTakeFirstOrThrow();
    return mapMember(row);
  });
}

export async function removeCommitteeMember(
  committeeId: string,
  memberId: string,
  actor: SessionUser,
): Promise<void> {
  assertHr(actor);
  const db = await ensureDatabaseReady();
  await db.transaction().execute(async (transaction) => {
    const member = await transaction
      .selectFrom("committee_members")
      .innerJoin("users", "users.id", "committee_members.user_id")
      .select(["committee_members.id", "users.id as user_id", "users.name"])
      .where("committee_members.id", "=", memberId)
      .where("committee_members.committee_id", "=", committeeId)
      .where("committee_members.is_active", "=", true)
      .executeTakeFirst();
    if (!member) throw new DomainError("NOT_FOUND", "委员不存在或已被移除");

    await transaction
      .updateTable("committee_members")
      .set({ is_active: false })
      .where("id", "=", memberId)
      .execute();

    await writeAuditLog(transaction, {
      actorUserId: actor.id,
      action: "COMMITTEE_MEMBER_REMOVED",
      entityType: "COMMITTEE",
      entityId: committeeId,
      details: { memberId, userId: member.user_id, name: member.name },
    });
  });
}
