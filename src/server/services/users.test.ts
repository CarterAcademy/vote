import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, DEMO_IDS, ensureDatabaseReady } from "../db";
import { addInitiator, listInitiators, updateInitiator } from "./users";

const actor = {
  id: DEMO_IDS.hr,
  dingtalkUserId: "dt_demo_hr_01",
  name: "何雨晴",
  role: "HR" as const,
};

describe("initiator management", () => {
  beforeAll(async () => {
    await ensureDatabaseReady();
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
