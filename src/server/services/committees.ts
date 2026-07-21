import { randomUUID } from "node:crypto";

import type { SessionUser } from "@/types";

import { ensureDatabaseReady } from "../db";
import {
  addCommitteeMemberSchema,
  createCommitteeSchema,
  updateCommitteeSchema,
  type AddCommitteeMemberInput,
  type CreateCommitteeInput,
  type UpdateCommitteeInput,
} from "../validation";
import { assertHr, toIso, writeAuditLog } from "./common";
import { DomainError } from "./errors";
import type { CommitteeDto } from "./polls";

async function getCommitteeById(committeeId: string): Promise<CommitteeDto> {
  const db = await ensureDatabaseReady();
  const row = await db
    .selectFrom("committees")
    .leftJoin("committee_members", (join) =>
      join
        .onRef("committee_members.committee_id", "=", "committees.id")
        .on("committee_members.is_active", "=", true),
    )
    .select([
      "committees.id",
      "committees.code",
      "committees.name",
      (expression) => expression.fn.count("committee_members.id").as("member_count"),
    ])
    .where("committees.id", "=", committeeId)
    .groupBy(["committees.id", "committees.code", "committees.name"])
    .executeTakeFirst();
  if (!row) throw new DomainError("NOT_FOUND", "小组不存在");
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    memberCount: Number(row.member_count),
  };
}

export async function createCommittee(
  input: CreateCommitteeInput | unknown,
  actor: SessionUser,
): Promise<CommitteeDto> {
  assertHr(actor);
  const parsed = createCommitteeSchema.parse(input);
  const db = await ensureDatabaseReady();
  const id = randomUUID();
  const duplicate = await db
    .selectFrom("committees")
    .select("id")
    .where("name", "=", parsed.name)
    .executeTakeFirst();
  if (duplicate) throw new DomainError("CONFLICT", "已存在同名小组");

  await db.transaction().execute(async (transaction) => {
    await transaction.insertInto("committees").values({
      id,
      code: `G_${randomUUID().replaceAll("-", "").slice(0, 28)}`,
      name: parsed.name,
    }).execute();

    for (const [index, member] of parsed.members.entries()) {
      let user = await transaction
        .selectFrom("users")
        .select(["id", "department"])
        .where("dingtalk_user_id", "=", member.dingtalkUserId)
        .executeTakeFirst();

      if (!user) {
        const userId = randomUUID();
        await transaction.insertInto("users").values({
          id: userId,
          dingtalk_user_id: member.dingtalkUserId,
          name: member.name,
          department: member.department?.trim() || null,
          role: "MEMBER",
        }).execute();
        user = { id: userId, department: member.department?.trim() || null };
      } else {
        await transaction.updateTable("users").set({
          name: member.name,
          department: member.department?.trim() || user.department,
          is_active: true,
          updated_at: new Date(),
        }).where("id", "=", user.id).execute();
      }

      const memberId = randomUUID();
      await transaction.insertInto("committee_members").values({
        id: memberId,
        committee_id: id,
        user_id: user.id,
        position: member.position?.trim() || "委员",
        display_order: index + 1,
      }).execute();
      await writeAuditLog(transaction, {
        actorUserId: actor.id,
        action: "COMMITTEE_MEMBER_ADDED",
        entityType: "COMMITTEE",
        entityId: id,
        details: { memberId, userId: user.id, name: member.name, committeeName: parsed.name },
      });
    }

    await writeAuditLog(transaction, {
      actorUserId: actor.id,
      action: "COMMITTEE_CREATED",
      entityType: "COMMITTEE",
      entityId: id,
      details: { name: parsed.name, memberCount: parsed.members.length },
    });
  });
  return getCommitteeById(id);
}

export async function updateCommittee(
  committeeId: string,
  input: UpdateCommitteeInput | unknown,
  actor: SessionUser,
): Promise<CommitteeDto> {
  assertHr(actor);
  const parsed = updateCommitteeSchema.parse(input);
  const db = await ensureDatabaseReady();
  const duplicate = await db
    .selectFrom("committees")
    .select("id")
    .where("name", "=", parsed.name)
    .where("id", "!=", committeeId)
    .executeTakeFirst();
  if (duplicate) throw new DomainError("CONFLICT", "已存在同名小组");

  await db.transaction().execute(async (transaction) => {
    const current = await transaction
      .selectFrom("committees")
      .select(["id", "name"])
      .where("id", "=", committeeId)
      .executeTakeFirst();
    if (!current) throw new DomainError("NOT_FOUND", "小组不存在");
    await transaction.updateTable("committees").set({
      name: parsed.name,
      updated_at: new Date(),
    }).where("id", "=", committeeId).execute();
    await writeAuditLog(transaction, {
      actorUserId: actor.id,
      action: "COMMITTEE_RENAMED",
      entityType: "COMMITTEE",
      entityId: committeeId,
      details: { previousName: current.name, name: parsed.name },
    });
  });
  return getCommitteeById(committeeId);
}

export async function deleteCommittee(
  committeeId: string,
  actor: SessionUser,
): Promise<void> {
  assertHr(actor);
  const db = await ensureDatabaseReady();
  await db.transaction().execute(async (transaction) => {
    const committee = await transaction
      .selectFrom("committees")
      .select(["id", "name"])
      .where("id", "=", committeeId)
      .executeTakeFirst();
    if (!committee) throw new DomainError("NOT_FOUND", "小组不存在");
    const poll = await transaction
      .selectFrom("polls")
      .select("id")
      .where("committee_id", "=", committeeId)
      .executeTakeFirst();
    if (poll) {
      throw new DomainError("CONFLICT", "该小组已有投票记录，不能删除；可以重命名或更新成员");
    }
    await writeAuditLog(transaction, {
      actorUserId: actor.id,
      action: "COMMITTEE_DELETED",
      entityType: "COMMITTEE",
      entityId: committeeId,
      details: { name: committee.name },
    });
    await transaction.deleteFrom("committees").where("id", "=", committeeId).execute();
  });
}

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
