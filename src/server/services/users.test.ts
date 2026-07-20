import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, ensureDatabaseReady } from "../db";
import { addInitiator, listInitiators, updateInitiator } from "./users";

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
});
