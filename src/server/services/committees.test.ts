import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, ensureDatabaseReady } from "../db";
import {
  addCommitteeMember,
  createCommittee,
  deleteCommittee,
  listCommitteeMembers,
  updateCommittee,
} from "./committees";

const actor = {
  id: "00000000-0000-4000-8000-000000000199",
  dingtalkUserId: "dt_committee_hr_01",
  name: "小组管理员",
  role: "HR" as const,
};

describe("committee management", () => {
  beforeAll(async () => {
    const db = await ensureDatabaseReady();
    await db.insertInto("users").values({
      id: actor.id,
      dingtalk_user_id: actor.dingtalkUserId,
      name: actor.name,
      role: actor.role,
    }).execute();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("creates, renames, updates members, and deletes an unused group", async () => {
    const created = await createCommittee({ name: "专项评审组" }, actor);
    expect(created).toMatchObject({ name: "专项评审组", memberCount: 0 });
    expect(created.code).toMatch(/^G_/);

    const renamed = await updateCommittee(created.id, { name: "重大项目评审组" }, actor);
    expect(renamed.name).toBe("重大项目评审组");

    const member = await addCommitteeMember(created.id, {
      dingtalkUserId: "dt_committee_member_01",
      name: "测试委员",
      department: "测试部门",
      position: "组员",
    }, actor);
    expect(member.position).toBe("组员");
    await expect(listCommitteeMembers(created.id)).resolves.toHaveLength(1);

    await deleteCommittee(created.id, actor);
    await expect(listCommitteeMembers(created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("creates a group with multiple selected members atomically", async () => {
    const created = await createCommittee({
      name: "多选委员测试组",
      members: [
        { dingtalkUserId: "dt_create_multi_01", name: "委员甲", department: "研究部" },
        { dingtalkUserId: "dt_create_multi_02", name: "委员乙", position: "专家" },
      ],
    }, actor);

    expect(created.memberCount).toBe(2);
    await expect(listCommitteeMembers(created.id)).resolves.toMatchObject([
      { name: "委员甲", position: "委员" },
      { name: "委员乙", position: "专家" },
    ]);
    await deleteCommittee(created.id, actor);
  });

  it("rejects duplicate group names", async () => {
    await expect(createCommittee({ name: "学术委员会" }, actor)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("requires an initiator or administrator role", async () => {
    await expect(createCommittee({ name: "无权限小组" }, {
      ...actor,
      id: "00000000-0000-4000-8000-000000000198",
      role: "MEMBER",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
