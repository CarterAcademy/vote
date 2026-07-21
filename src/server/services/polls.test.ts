import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, ensureDatabaseReady } from "../db";
import { DEMO_IDS } from "../db/seed";
import { createPoll } from "./polls";

const actor = {
  id: "00000000-0000-4000-8000-000000000299",
  dingtalkUserId: "dt_poll_hr_01",
  name: "投票发起人",
  role: "HR" as const,
};

describe("poll voter selection", () => {
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

  it("creates a poll using only directly selected voters", async () => {
    const poll = await createPoll({
      title: "专项人选评审",
      candidateName: "林海",
      deadlineAt: "2099-07-21T18:00:00+08:00",
      directVoters: [{
        dingtalkUserId: "dt_direct_voter_01",
        name: "直接评审人",
        department: "专项工作组",
      }],
    }, actor);

    expect(poll).toMatchObject({ committeeId: null, committeeName: "自选评审人" });
    const db = await ensureDatabaseReady();
    const voters = await db.selectFrom("poll_voters")
      .select(["dingtalk_user_id", "voter_name"])
      .where("poll_id", "=", poll.id)
      .execute();
    expect(voters).toEqual([{
      dingtalk_user_id: "dt_direct_voter_01",
      voter_name: "直接评审人",
    }]);
  });

  it("merges duplicate committee and directly selected voters", async () => {
    const poll = await createPoll({
      committeeId: DEMO_IDS.academicCommittee,
      title: "组合人选评审",
      candidateName: "周岚",
      deadlineAt: "2099-07-21T18:00:00+08:00",
      directVoters: [
        { dingtalkUserId: "dt_demo_academic_01", name: "重复委员" },
        { dingtalkUserId: "dt_direct_voter_02", name: "增补评审人" },
      ],
    }, actor);

    const db = await ensureDatabaseReady();
    const count = await db.selectFrom("poll_voters")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("poll_id", "=", poll.id)
      .executeTakeFirstOrThrow();
    expect(Number(count.count)).toBe(11);
  });
});
