import { randomUUID } from "node:crypto";

import type { SessionUser } from "@/types";

import { ensureDatabaseReady } from "../db";
import {
  getDingTalkGateway,
  isMockModeEnabled,
  type DingTalkGateway,
} from "../dingtalk";
import { assertHr, writeAuditLog } from "./common";
import { DomainError } from "./errors";

const REMINDER_COOLDOWN_SECONDS = 60;

export interface ReminderResult {
  pollVoterId: string;
  name: string;
  status: "SENT" | "FAILED";
  requestId?: string;
  error?: string;
}

export interface ReminderBatchResult {
  requested: number;
  sent: number;
  failed: number;
  results: ReminderResult[];
}

export function reminderCooldownRemaining(
  now: Date,
  lastReminderAt: Date,
  cooldownSeconds = REMINDER_COOLDOWN_SECONDS,
): number {
  const elapsedSeconds = Math.floor(
    (now.getTime() - lastReminderAt.getTime()) / 1000,
  );
  return Math.max(0, cooldownSeconds - elapsedSeconds);
}

export async function remindMissingVoters(
  pollId: string,
  actor: SessionUser,
  gateway: DingTalkGateway = getDingTalkGateway(),
): Promise<ReminderBatchResult> {
  assertHr(actor);
  const db = await ensureDatabaseReady();
  const configuredBaseUrl = process.env.DINGTALK_APP_BASE_URL?.trim();
  if (
    !configuredBaseUrl &&
    process.env.NODE_ENV === "production" &&
    !isMockModeEnabled()
  ) {
    throw new Error("DINGTALK_APP_BASE_URL must be configured in production");
  }
  const baseUrl = configuredBaseUrl ?? "http://localhost:3000";
  if (
    process.env.NODE_ENV === "production" &&
    !isMockModeEnabled() &&
    new URL(baseUrl).protocol !== "https:"
  ) {
    throw new Error("DINGTALK_APP_BASE_URL must use HTTPS in production");
  }
  const actionUrl = new URL(`/vote/${pollId}`, baseUrl).toString();
  const now = new Date();
  const cooldownStart = new Date(
    now.getTime() - REMINDER_COOLDOWN_SECONDS * 1000,
  );

  const preparation = await db.transaction().execute(async (transaction) => {
    // Locking the poll serializes concurrent clicks before the cooldown check and
    // ensures exactly one batch can reserve PENDING delivery rows.
    const poll = await transaction
      .selectFrom("polls")
      .select([
        "id",
        "title",
        "candidate_name",
        "status",
        "deadline_at",
      ])
      .where("id", "=", pollId)
      .forUpdate()
      .executeTakeFirst();
    if (!poll) throw new DomainError("NOT_FOUND", "投票不存在");
    if (poll.status !== "OPEN") {
      throw new DomainError("POLL_CLOSED", "投票已关闭，无需催投");
    }
    if (new Date(poll.deadline_at) <= now) {
      throw new DomainError("DEADLINE_PASSED", "投票已到截止时间，无需催投");
    }

    const recent = await transaction
      .selectFrom("reminder_logs")
      .select("created_at")
      .where("poll_id", "=", pollId)
      .where("triggered_by_user_id", "=", actor.id)
      .where("created_at", ">=", cooldownStart)
      .orderBy("created_at", "desc")
      .executeTakeFirst();
    if (recent) {
      const retryAfterSeconds = reminderCooldownRemaining(
        now,
        new Date(recent.created_at),
      );
      throw new DomainError(
        "CONFLICT",
        `催投操作过于频繁，请在 ${retryAfterSeconds} 秒后重试`,
        { retryAfterSeconds },
      );
    }

    const missing = await transaction
      .selectFrom("poll_voters")
      .leftJoin("votes", "votes.poll_voter_id", "poll_voters.id")
      .select([
        "poll_voters.id as poll_voter_id",
        "poll_voters.dingtalk_user_id",
        "poll_voters.voter_name",
      ])
      .where("poll_voters.poll_id", "=", pollId)
      .where("votes.id", "is", null)
      .orderBy("poll_voters.display_order", "asc")
      .execute();
    const deliveries = missing.map((voter) => ({
      logId: randomUUID(),
      pollVoterId: voter.poll_voter_id,
      dingtalkUserId: voter.dingtalk_user_id,
      name: voter.voter_name,
    }));

    if (deliveries.length > 0) {
      await transaction
        .insertInto("reminder_logs")
        .values(
          deliveries.map((delivery) => ({
            id: delivery.logId,
            poll_id: pollId,
            poll_voter_id: delivery.pollVoterId,
            triggered_by_user_id: actor.id,
            delivery_status: "PENDING" as const,
            request_id: null,
            error_message: null,
            sent_at: null,
            created_at: now,
          })),
        )
        .execute();
    }

    return { poll, deliveries };
  });
  const results: ReminderResult[] = [];

  for (const voter of preparation.deliveries) {
    try {
      const delivery = await gateway.sendDirectReminder({
        userId: voter.dingtalkUserId,
        title: "两委会评审投票提醒",
        message: `${voter.name}委员，您有一项“${preparation.poll.candidate_name}：${preparation.poll.title}”评审投票尚未提交，请在截止时间前完成。`,
        actionUrl,
      });
      const sentAt = new Date();
      await db
        .updateTable("reminder_logs")
        .set({
          delivery_status: "SENT",
          request_id: delivery.requestId ?? null,
          sent_at: sentAt,
        })
        .where("id", "=", voter.logId)
        .execute();
      results.push({
        pollVoterId: voter.pollVoterId,
        name: voter.name,
        status: "SENT",
        ...(delivery.requestId ? { requestId: delivery.requestId } : {}),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "钉钉提醒发送失败";
      await db
        .updateTable("reminder_logs")
        .set({
          delivery_status: "FAILED",
          error_message: errorMessage,
        })
        .where("id", "=", voter.logId)
        .execute();
      results.push({
        pollVoterId: voter.pollVoterId,
        name: voter.name,
        status: "FAILED",
        error: errorMessage,
      });
    }
  }

  const sent = results.filter((result) => result.status === "SENT").length;
  const failed = results.length - sent;
  await writeAuditLog(db, {
    actorUserId: actor.id,
    action: "REMINDERS_SENT",
    entityType: "POLL",
    entityId: pollId,
    details: { requested: results.length, sent, failed },
  });

  return { requested: results.length, sent, failed, results };
}
