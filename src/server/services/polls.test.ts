import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabase, ensureDatabaseReady } from "../db";
import { DEMO_IDS } from "../db/seed";
import { createPoll, getPollDetail, listPolls } from "./polls";

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

  it("creates a poll with only the selected committee members", async () => {
    const poll = await createPoll({
      committeeId: DEMO_IDS.academicCommittee,
      committeeVoterIds: ["dt_demo_academic_01", "dt_demo_academic_02"],
      title: "部分委员人选评审",
      candidateName: "陈宁",
      deadlineAt: "2099-07-21T18:00:00+08:00",
    }, actor);

    const db = await ensureDatabaseReady();
    const voters = await db.selectFrom("poll_voters")
      .select("dingtalk_user_id")
      .where("poll_id", "=", poll.id)
      .orderBy("display_order", "asc")
      .execute();
    expect(voters.map((voter) => voter.dingtalk_user_id)).toEqual([
      "dt_demo_academic_01",
      "dt_demo_academic_02",
    ]);
  });

  it("filters poll records by inclusive deadline bounds", async () => {
    const db = await ensureDatabaseReady();
    await db.insertInto("polls").values([
      {
        id: "00000000-0000-4000-8000-000000000311",
        committee_id: null,
        title: "截止日期筛选-范围前",
        candidate_name: "范围前",
        status: "OPEN",
        starts_at: "2099-07-30T00:00:00.000Z",
        deadline_at: "2099-08-01T23:59:59.999Z",
        closed_at: null,
        closed_by_user_id: null,
        close_reason: null,
        created_by_user_id: actor.id,
        created_at: "2099-08-02T12:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000312",
        committee_id: null,
        title: "截止日期筛选-范围内",
        candidate_name: "范围内",
        status: "OPEN",
        starts_at: "2099-07-30T00:00:00.000Z",
        deadline_at: "2099-08-02T23:59:59.999Z",
        closed_at: null,
        closed_by_user_id: null,
        close_reason: null,
        created_by_user_id: actor.id,
        created_at: "2099-08-01T12:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000313",
        committee_id: null,
        title: "截止日期筛选-范围后",
        candidate_name: "范围后",
        status: "OPEN",
        starts_at: "2099-07-30T00:00:00.000Z",
        deadline_at: "2099-08-03T00:00:00.000Z",
        closed_at: null,
        closed_by_user_id: null,
        close_reason: null,
        created_by_user_id: actor.id,
        created_at: "2099-08-02T12:00:00.000Z",
      },
    ]).execute();

    const result = await listPolls({
      from: "2099-08-02T00:00:00.000Z",
      to: "2099-08-02T23:59:59.999Z",
      scope: "OWN",
    }, actor);

    expect(result.items.map((poll) => poll.title)).toEqual(["截止日期筛选-范围内"]);
    expect(result.total).toBe(1);
  });

  it.each([
    ["malformed", "not-a-poll-id"],
    ["unknown", "00000000-0000-4000-8000-000000000399"],
  ])("returns a typed not-found result for a %s poll ID", async (_kind, pollId) => {
    await expect(getPollDetail(pollId, actor)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });
});
