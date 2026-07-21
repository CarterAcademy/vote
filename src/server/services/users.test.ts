import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, ensureDatabaseReady } from "../db";
import { MockDingTalkGateway } from "../dingtalk";
import {
  addInitiator,
  authenticateDingTalkCode,
  authenticateDingTalkWebCode,
  getUserById,
  listInitiators,
  updateInitiator,
} from "./users";
import { listPolls } from "./polls";

const actor = {
  id: "00000000-0000-4000-8000-000000000099",
  dingtalkUserId: "dt_test_hr_01",
  name: "测试发起人",
  role: "HR" as const,
};

describe("initiator management", () => {
  beforeAll(async () => {
    const db = await ensureDatabaseReady();
    await db
      .insertInto("users")
      .values({
        id: actor.id,
        dingtalk_user_id: actor.dingtalkUserId,
        name: actor.name,
        department: "测试部门",
        role: actor.role,
      })
      .execute();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("adds and deactivates an initiator without deleting the account", async () => {
    const added = await addInitiator({
      dingtalkUserId: "dt_test_hr_02",
      name: "林若安",
      department: "人力资源部",
    }, actor);
    expect(added.isActive).toBe(true);

    const deactivated = await updateInitiator(added.id, { isActive: false }, actor);
    expect(deactivated.isActive).toBe(false);
    expect((await listInitiators(actor)).find((item) => item.id === added.id)?.isActive).toBe(false);
  });

  it("does not allow an initiator to deactivate the current account", async () => {
    await expect(updateInitiator(actor.id, { isActive: false }, actor)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("syncs the authenticated user's DingTalk name and department", async () => {
    class IdentityGateway extends MockDingTalkGateway {
      override async exchangeAuthCode() {
        return {
          userId: actor.dingtalkUserId,
          name: "测试发起人（钉钉）",
          department: "智能创新部 / 研究院员工",
        };
      }
    }

    await expect(
      authenticateDingTalkCode("auth-code", new IdentityGateway()),
    ).resolves.toMatchObject({ name: "测试发起人（钉钉）" });

    const db = await ensureDatabaseReady();
    await expect(
      db.selectFrom("users")
        .select(["name", "department"])
        .where("id", "=", actor.id)
        .executeTakeFirstOrThrow(),
    ).resolves.toMatchObject({
      name: "测试发起人（钉钉）",
      department: "智能创新部 / 研究院员工",
    });
  });

  it("creates an ordinary user on first DingTalk login", async () => {
    class NewUserGateway extends MockDingTalkGateway {
      override async exchangeAuthCode() {
        return {
          userId: "dt_ordinary_without_poll_01",
          name: "普通用户",
          department: "测试部门",
        };
      }
    }

    const user = await authenticateDingTalkCode(
      "auth-code",
      new NewUserGateway(),
    );

    expect(user).toMatchObject({
      dingtalkUserId: "dt_ordinary_without_poll_01",
      name: "普通用户",
      role: "MEMBER",
    });
    await expect(getUserById(user.id)).resolves.toMatchObject({
      role: "MEMBER",
    });
    await expect(
      listPolls({ scope: "ELIGIBLE" }, user),
    ).resolves.toMatchObject({ items: [], total: 0 });
  });

  it("creates an ordinary user on first DingTalk web login", async () => {
    class NewWebUserGateway extends MockDingTalkGateway {
      override async exchangeWebAuthCode() {
        return {
          userId: "dt_ordinary_web_without_poll_01",
          name: "网页普通用户",
        };
      }
    }

    await expect(
      authenticateDingTalkWebCode("auth-code", new NewWebUserGateway()),
    ).resolves.toMatchObject({
      dingtalkUserId: "dt_ordinary_web_without_poll_01",
      role: "MEMBER",
    });
  });

  it("promotes a committee member to initiator without removing member access", async () => {
    const db = await ensureDatabaseReady();
    const userId = "00000000-0000-4000-8000-000000000088";
    const committee = await db
      .selectFrom("committees")
      .select("id")
      .where("code", "=", "ACADEMIC")
      .executeTakeFirstOrThrow();
    await db.insertInto("users").values({
      id: userId,
      dingtalk_user_id: "dt_dual_role_01",
      name: "吴衍标",
      role: "MEMBER",
    }).execute();
    await db.insertInto("committee_members").values({
      id: "00000000-0000-4000-8000-000000000066",
      committee_id: committee.id,
      user_id: userId,
      position: "委员",
      display_order: 1,
    }).execute();

    await addInitiator({ dingtalkUserId: "dt_dual_role_01", name: "吴衍标" }, actor);

    await expect(getUserById(userId)).resolves.toMatchObject({
      role: "HR",
      isCommitteeMember: true,
    });
  });
});
