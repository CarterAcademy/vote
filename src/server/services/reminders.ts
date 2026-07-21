import { randomUUID } from "node:crypto";

import type { SessionUser } from "@/types";

import {
  ensureDatabaseReady,
  type PollNotificationType,
} from "../db";
import {
  getDingTalkGateway,
  isMockModeEnabled,
  type DingTalkGateway,
} from "../dingtalk";
import { isPrivateNetworkHost } from "../dingtalk/web-oauth";
import { assertHr, writeAuditLog } from "./common";
import { DomainError } from "./errors";

const REMINDER_COOLDOWN_SECONDS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

type AutomaticNotificationType = Exclude<PollNotificationType, "MANUAL">;

interface NotificationBatchSummary {
  type: AutomaticNotificationType;
  requested: number;
  sent: number;
  failed: number;
}

export interface ScheduledNotificationResult {
  processedPolls: number;
  requested: number;
  sent: number;
  failed: number;
  batches: NotificationBatchSummary[];
}

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

export function getVoteActionUrl(pollId: string): string {
  const configuredBaseUrl = process.env.DINGTALK_APP_BASE_URL?.trim();
  if (
    !configuredBaseUrl &&
    process.env.NODE_ENV === "production" &&
    !isMockModeEnabled()
  ) {
    throw new Error("DINGTALK_APP_BASE_URL must be configured in production");
  }
  const baseUrl = configuredBaseUrl ?? "http://localhost:3000";
  const parsedBaseUrl = new URL(baseUrl);
  const privateNetworkAllowed =
    process.env.DINGTALK_APP_ALLOW_INSECURE_BASE_URL === "true" &&
    isPrivateNetworkHost(parsedBaseUrl.hostname);
  if (
    process.env.NODE_ENV === "production" &&
    !isMockModeEnabled() &&
    parsedBaseUrl.protocol !== "https:" &&
    !privateNetworkAllowed
  ) {
    throw new Error(
      "DINGTALK_APP_BASE_URL must use HTTPS in production unless an explicit private-network override is enabled",
    );
  }
  return new URL(`/vote/${pollId}`, parsedBaseUrl).toString();
}

function formatDeadline(deadline: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(deadline);
}

export function scheduledNotificationType(
  deadline: Date,
  createdAt: Date,
  now: Date,
): Exclude<AutomaticNotificationType, "POLL_LAUNCHED">[] {
  const untilDeadline = deadline.getTime() - now.getTime();
  if (untilDeadline <= 0) return [];

  const types: Exclude<AutomaticNotificationType, "POLL_LAUNCHED">[] = [];
  const deadline24h = deadline.getTime() - DAY_MS;
  const deadline3h = deadline.getTime() - THREE_HOURS_MS;
  if (
    createdAt.getTime() <= deadline24h &&
    untilDeadline <= DAY_MS &&
    untilDeadline > THREE_HOURS_MS
  ) {
    types.push("DEADLINE_24H");
  }
  if (createdAt.getTime() <= deadline3h && untilDeadline <= THREE_HOURS_MS) {
    types.push("DEADLINE_3H");
  }
  return types;
}

export async function remindMissingVoters(
  pollId: string,
  actor: SessionUser,
  gateway: DingTalkGateway = getDingTalkGateway(),
): Promise<ReminderBatchResult> {
  assertHr(actor);
  const db = await ensureDatabaseReady();
  const actionUrl = getVoteActionUrl(pollId);
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
            notification_type: "MANUAL" as const,
            scheduled_for: now,
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


async function sendAutomaticNotificationBatch(
  pollId: string,
  type: AutomaticNotificationType,
  scheduledFor: Date,
  gateway: DingTalkGateway,
): Promise<NotificationBatchSummary> {
  const db = await ensureDatabaseReady();
  const now = new Date();
  const actionUrl = getVoteActionUrl(pollId);
  const preparation = await db.transaction().execute(async (transaction) => {
    const poll = await transaction
      .selectFrom("polls")
      .select(["id", "title", "candidate_name", "status", "deadline_at"])
      .where("id", "=", pollId)
      .forUpdate()
      .executeTakeFirst();
    if (!poll || poll.status !== "OPEN" || new Date(poll.deadline_at) <= now) {
      return null;
    }

    let voterQuery = transaction
      .selectFrom("poll_voters")
      .leftJoin("votes", "votes.poll_voter_id", "poll_voters.id")
      .select([
        "poll_voters.id as poll_voter_id",
        "poll_voters.dingtalk_user_id",
        "poll_voters.voter_name",
      ])
      .where("poll_voters.poll_id", "=", pollId);
    if (type !== "POLL_LAUNCHED") {
      voterQuery = voterQuery.where("votes.id", "is", null);
    }
    const voters = await voterQuery
      .orderBy("poll_voters.display_order", "asc")
      .execute();
    if (voters.length === 0) return { poll, deliveries: [] };

    const alreadyReserved = await transaction
      .selectFrom("reminder_logs")
      .select(["id", "poll_voter_id", "delivery_status"])
      .where("notification_type", "=", type)
      .where("scheduled_for", "=", scheduledFor)
      .where("poll_voter_id", "in", voters.map((voter) => voter.poll_voter_id))
      .execute();
    const reservationByVoter = new Map(
      alreadyReserved.map((row) => [row.poll_voter_id, row]),
    );

    const newVoters = voters.filter(
      (voter) => !reservationByVoter.has(voter.poll_voter_id),
    );
    const candidates = newVoters.map((voter) => ({
      id: randomUUID(),
      poll_id: pollId,
      poll_voter_id: voter.poll_voter_id,
      triggered_by_user_id: null,
      notification_type: type,
      scheduled_for: scheduledFor,
      delivery_status: "PENDING" as const,
      request_id: null,
      error_message: null,
      sent_at: null,
      created_at: now,
    }));
    if (candidates.length > 0) {
      await transaction.insertInto("reminder_logs").values(candidates).execute();
    }
    const retryVoters = voters.flatMap((voter) => {
      const reservation = reservationByVoter.get(voter.poll_voter_id);
      return reservation?.delivery_status === "FAILED"
        ? [{ voter, logId: reservation.id }]
        : [];
    });
    if (retryVoters.length > 0) {
      await transaction.updateTable("reminder_logs").set({
        delivery_status: "PENDING",
        request_id: null,
        error_message: null,
      }).where("id", "in", retryVoters.map((entry) => entry.logId)).execute();
    }
    return {
      poll,
      deliveries: [
        ...retryVoters.map(({ voter, logId }) => ({
          logId,
          pollVoterId: voter.poll_voter_id,
          dingtalkUserId: voter.dingtalk_user_id,
          name: voter.voter_name,
        })),
        ...candidates.map((candidate, index) => ({
          logId: candidate.id,
          pollVoterId: candidate.poll_voter_id,
          dingtalkUserId: newVoters[index].dingtalk_user_id,
          name: newVoters[index].voter_name,
        })),
      ],
    };
  });

  if (!preparation || preparation.deliveries.length === 0) {
    return { type, requested: 0, sent: 0, failed: 0 };
  }

  const deadlineText = formatDeadline(new Date(preparation.poll.deadline_at));
  let sent = 0;
  let failed = 0;
  for (const voter of preparation.deliveries) {
    const isLaunch = type === "POLL_LAUNCHED";
    try {
      const delivery = await gateway.sendDirectReminder({
        userId: voter.dingtalkUserId,
        title: isLaunch ? "新的两委会评审投票" : "两委会评审投票截止提醒",
        message: isLaunch
          ? `${voter.name}委员，您已被选为“${preparation.poll.candidate_name}：${preparation.poll.title}”的评审人，请于 ${deadlineText} 前完成投票。`
          : `${voter.name}委员，您尚未提交“${preparation.poll.candidate_name}：${preparation.poll.title}”评审投票，请于 ${deadlineText} 前完成。`,
        actionUrl,
      });
      await db.updateTable("reminder_logs").set({
        delivery_status: "SENT",
        request_id: delivery.requestId ?? null,
        sent_at: new Date(),
      }).where("id", "=", voter.logId).execute();
      sent += 1;
    } catch (error) {
      await db.updateTable("reminder_logs").set({
        delivery_status: "FAILED",
        error_message: error instanceof Error ? error.message : "钉钉通知发送失败",
      }).where("id", "=", voter.logId).execute();
      failed += 1;
    }
  }

  const summary = {
    type,
    requested: preparation.deliveries.length,
    sent,
    failed,
  };
  await writeAuditLog(db, {
    actorUserId: null,
    action: type === "POLL_LAUNCHED" ? "POLL_LAUNCH_NOTIFICATIONS_SENT" : "AUTOMATIC_REMINDERS_SENT",
    entityType: "POLL",
    entityId: pollId,
    details: summary,
  });
  return summary;
}

export async function sendPollLaunchNotifications(
  pollId: string,
  launchedAt: Date,
  gateway: DingTalkGateway = getDingTalkGateway(),
): Promise<NotificationBatchSummary> {
  return sendAutomaticNotificationBatch(
    pollId,
    "POLL_LAUNCHED",
    launchedAt,
    gateway,
  );
}

export async function sendScheduledPollNotifications(
  now = new Date(),
  gateway: DingTalkGateway = getDingTalkGateway(),
): Promise<ScheduledNotificationResult> {
  const db = await ensureDatabaseReady();
  const polls = await db
    .selectFrom("polls")
    .select(["id", "created_at", "deadline_at"])
    .where("status", "=", "OPEN")
    .where("deadline_at", ">", now)
    .where("deadline_at", "<=", new Date(now.getTime() + DAY_MS))
    .orderBy("deadline_at", "asc")
    .execute();

  const batches: NotificationBatchSummary[] = [];
  for (const poll of polls) {
    const deadline = new Date(poll.deadline_at);
    for (const type of scheduledNotificationType(
      deadline,
      new Date(poll.created_at),
      now,
    )) {
      const offset = type === "DEADLINE_24H" ? DAY_MS : THREE_HOURS_MS;
      batches.push(await sendAutomaticNotificationBatch(
        poll.id,
        type,
        new Date(deadline.getTime() - offset),
        gateway,
      ));
    }
  }

  return {
    processedPolls: polls.length,
    requested: batches.reduce((sum, batch) => sum + batch.requested, 0),
    sent: batches.reduce((sum, batch) => sum + batch.sent, 0),
    failed: batches.reduce((sum, batch) => sum + batch.failed, 0),
    batches,
  };
}
