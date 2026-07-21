import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { closeDatabase, ensureDatabaseReady } from "../db";
import { MockDingTalkGateway, setDingTalkGatewayForTests } from "../dingtalk";
import { createPoll } from "./polls";
import {
  getVoteActionUrl,
  reminderCooldownRemaining,
  scheduledNotificationType,
  sendScheduledPollNotifications,
} from "./reminders";

describe("getVoteActionUrl", () => {
  const originalMockMode = process.env.DINGTALK_MOCK_ENABLED;
  const originalBaseUrl = process.env.DINGTALK_APP_BASE_URL;
  const originalInsecureBaseUrl =
    process.env.DINGTALK_APP_ALLOW_INSECURE_BASE_URL;

  afterAll(() => {
    vi.unstubAllEnvs();
    if (originalMockMode === undefined) delete process.env.DINGTALK_MOCK_ENABLED;
    else process.env.DINGTALK_MOCK_ENABLED = originalMockMode;
    if (originalBaseUrl === undefined) delete process.env.DINGTALK_APP_BASE_URL;
    else process.env.DINGTALK_APP_BASE_URL = originalBaseUrl;
    if (originalInsecureBaseUrl === undefined) {
      delete process.env.DINGTALK_APP_ALLOW_INSECURE_BASE_URL;
    } else {
      process.env.DINGTALK_APP_ALLOW_INSECURE_BASE_URL = originalInsecureBaseUrl;
    }
  });

  it("allows an explicitly configured private HTTP production base URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.DINGTALK_MOCK_ENABLED = "false";
    process.env.DINGTALK_APP_BASE_URL = "http://10.1.130.9:3011";
    delete process.env.DINGTALK_APP_ALLOW_INSECURE_BASE_URL;

    expect(() => getVoteActionUrl("poll-1")).toThrow("must use HTTPS");

    process.env.DINGTALK_APP_ALLOW_INSECURE_BASE_URL = "true";
    expect(getVoteActionUrl("poll-1")).toBe(
      "http://10.1.130.9:3011/vote/poll-1",
    );
  });
});

describe("reminderCooldownRemaining", () => {
  const now = new Date("2026-07-17T12:00:00.000Z");

  it("returns the seconds remaining in the cooldown", () => {
    expect(
      reminderCooldownRemaining(
        now,
        new Date("2026-07-17T11:59:42.000Z"),
      ),
    ).toBe(42);
  });

  it("never returns a negative value", () => {
    expect(
      reminderCooldownRemaining(
        now,
        new Date("2026-07-17T11:58:00.000Z"),
      ),
    ).toBe(0);
  });
});

describe("scheduledNotificationType", () => {
  const deadline = new Date("2099-07-21T10:00:00.000Z");
  const createdAt = new Date("2099-07-19T09:00:00.000Z");

  it("selects the 24-hour and 3-hour windows at their thresholds", () => {
    expect(scheduledNotificationType(
      deadline,
      createdAt,
      new Date("2099-07-20T10:00:00.000Z"),
    )).toEqual(["DEADLINE_24H"]);
    expect(scheduledNotificationType(
      deadline,
      createdAt,
      new Date("2099-07-21T07:00:00.000Z"),
    )).toEqual(["DEADLINE_3H"]);
  });

  it("does not backfill a reminder whose scheduled time predates the poll", () => {
    expect(scheduledNotificationType(
      deadline,
      new Date("2099-07-20T12:00:00.000Z"),
      new Date("2099-07-20T12:01:00.000Z"),
    )).toEqual([]);
  });
});

describe("automatic deadline notifications", () => {
  const actor = {
    id: "00000000-0000-4000-8000-000000000298",
    dingtalkUserId: "dt_reminder_hr_01",
    name: "提醒任务发起人",
    role: "HR" as const,
  };

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
    setDingTalkGatewayForTests(undefined);
    await closeDatabase();
  });

  it("notifies only missing voters and remains idempotent", async () => {
    const launchGateway = new MockDingTalkGateway();
    setDingTalkGatewayForTests(launchGateway);
    const deadline = new Date("2099-07-21T10:00:00.000Z");
    const poll = await createPoll({
      title: "自动提醒测试",
      candidateName: "测试候选人",
      deadlineAt: deadline,
      directVoters: [
        { dingtalkUserId: "dt_scheduled_01", name: "已投委员" },
        { dingtalkUserId: "dt_scheduled_02", name: "未投委员" },
      ],
    }, actor);
    const db = await ensureDatabaseReady();
    const launchFailure = await db.selectFrom("audit_logs")
      .select("details")
      .where("entity_id", "=", poll.id)
      .where("action", "=", "POLL_LAUNCH_NOTIFICATIONS_FAILED")
      .executeTakeFirst();
    expect(launchFailure).toBeUndefined();
    expect(launchGateway.sentReminders).toHaveLength(2);

    const submittedVoter = await db.selectFrom("poll_voters")
      .select(["id", "user_id"])
      .where("poll_id", "=", poll.id)
      .where("dingtalk_user_id", "=", "dt_scheduled_01")
      .executeTakeFirstOrThrow();
    const submittedAt = new Date("2099-07-20T09:00:00.000Z");
    await db.insertInto("votes").values({
      id: randomUUID(),
      poll_id: poll.id,
      poll_voter_id: submittedVoter.id,
      choice: "APPROVE",
      opinion: "同意",
      version: 1,
      submitted_at: submittedAt,
      updated_at: submittedAt,
    }).execute();

    const gateway = new MockDingTalkGateway();
    const now = new Date("2099-07-20T10:00:00.000Z");
    const first = await sendScheduledPollNotifications(now, gateway);
    const second = await sendScheduledPollNotifications(now, gateway);

    expect(first.sent).toBe(1);
    expect(second.sent).toBe(0);
    expect(gateway.sentReminders).toHaveLength(1);
    expect(gateway.sentReminders[0].userId).toBe("dt_scheduled_02");
  });
});
