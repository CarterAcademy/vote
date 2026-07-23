import { choiceLabel, formatDateTime } from "@/lib/client/format";
import type { AuditLog, VoteChoice } from "@/lib/client/types";

const actionLabels: Record<string, string> = {
  POLL_CREATED: "发起投票",
  POLL_CLOSED: "关闭投票",
  POLL_AUTO_CLOSED: "到期自动关闭",
  POLL_LAUNCH_NOTIFICATIONS_SENT: "发送投票通知",
  POLL_LAUNCH_NOTIFICATIONS_FAILED: "投票通知发送异常",
  AUTOMATIC_REMINDERS_SENT: "发送截止提醒",
  VOTE_CAST: "提交投票",
  VOTE_UPDATED: "修改投票",
  REMINDER_SENT: "发送催投提醒",
  REMINDERS_SENT: "发送催投提醒",
  POLL_EXPORTED: "导出投票记录",
  CREATE_POLL: "发起投票",
  CLOSE_POLL: "关闭投票",
  CAST_VOTE: "提交投票",
  UPDATE_VOTE: "修改投票",
  REMIND_VOTERS: "发送催投提醒",
  EXPORT_POLL: "导出投票记录",
};

function record(details: AuditLog["details"]): Record<string, unknown> | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  return details;
}

function text(details: Record<string, unknown>, key: string): string | null {
  const value = details[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function count(details: Record<string, unknown>, key: string): number | null {
  const value = details[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function localizedChoice(value: string | null): string | null {
  return value === "APPROVE" || value === "REJECT" || value === "ABSTAIN"
    ? choiceLabel(value as VoteChoice)
    : null;
}

function deliverySummary(details: Record<string, unknown>, subject: string): string | null {
  const requested = count(details, "requested");
  const sent = count(details, "sent");
  const failed = count(details, "failed");
  if (requested === null && sent === null && failed === null) return null;

  const parts = [
    requested === null ? null : `${subject} ${requested} 人`,
    sent === null ? null : `成功 ${sent} 人`,
    failed === null ? null : `失败 ${failed} 人`,
  ].filter((part): part is string => Boolean(part));
  return parts.join("，");
}

/** Returns a stable, localized label without exposing an unknown internal event code. */
export function auditLabel(log: AuditLog): string {
  return actionLabels[log.action] ?? "其他系统操作";
}

/**
 * Converts the known public parts of an audit payload into a review-friendly
 * sentence. UUIDs, request IDs, error payloads, and unknown fields are omitted.
 */
export function auditDetails(log: AuditLog): string | null {
  const details = record(log.details);
  if (!details) return null;

  switch (log.action) {
    case "POLL_CREATED":
    case "CREATE_POLL": {
      const title = text(details, "title");
      const candidateName = text(details, "candidateName");
      const committeeName = text(details, "committeeName");
      const voterCount = count(details, "voterCount");
      const deadlineAt = text(details, "deadlineAt");
      const attachments = Array.isArray(details.attachments) ? details.attachments.length : null;
      const parts = [
        title ? `标题：${title}` : null,
        candidateName ? `人选：${candidateName}` : null,
        committeeName ? `委员会：${committeeName}` : null,
        voterCount === null ? null : `评审人：${voterCount} 人`,
        deadlineAt ? `截止：${formatDateTime(deadlineAt)}` : null,
        attachments === null ? null : `附件：${attachments} 个`,
      ].filter((part): part is string => Boolean(part));
      return parts.length ? parts.join("；") : null;
    }

    case "VOTE_CAST":
    case "CAST_VOTE": {
      const voterName = text(details, "voterName");
      const choice = localizedChoice(text(details, "choice"));
      const version = count(details, "version");
      const voiceRecordingCount = count(details, "voiceRecordingCount");
      const parts = [
        voterName ? `评审人：${voterName}` : null,
        choice ? `意见：${choice}` : null,
        version === null ? null : `第 ${version} 版`,
        voiceRecordingCount ? `语音记录：${voiceRecordingCount} 条` : null,
      ].filter((part): part is string => Boolean(part));
      return parts.length ? parts.join("；") : null;
    }

    case "VOTE_UPDATED":
    case "UPDATE_VOTE": {
      const voterName = text(details, "voterName");
      const previousChoice = localizedChoice(text(details, "previousChoice"));
      const choice = localizedChoice(text(details, "choice"));
      const version = count(details, "version");
      const change = previousChoice && choice
        ? `意见：${previousChoice} → ${choice}`
        : choice ? `意见：${choice}` : null;
      const parts = [
        voterName ? `评审人：${voterName}` : null,
        change,
        version === null ? null : `第 ${version} 版`,
      ].filter((part): part is string => Boolean(part));
      return parts.length ? parts.join("；") : null;
    }

    case "POLL_LAUNCH_NOTIFICATIONS_SENT":
      return deliverySummary(details, "通知");

    case "POLL_LAUNCH_NOTIFICATIONS_FAILED":
      return "投票已成功发起，但通知未能完成发送，请联系管理员检查通知服务。";

    case "REMINDER_SENT":
    case "REMINDERS_SENT":
    case "REMIND_VOTERS":
      return deliverySummary(details, "提醒");

    case "AUTOMATIC_REMINDERS_SENT": {
      const reminderLabels: Record<string, string> = {
        DEADLINE_24H: "截止前 24 小时提醒",
        DEADLINE_3H: "截止前 3 小时提醒",
      };
      const type = text(details, "type");
      const summary = deliverySummary(details, "提醒");
      const label = type ? reminderLabels[type] : null;
      return [label, summary].filter((part): part is string => Boolean(part)).join("；") || null;
    }

    case "POLL_CLOSED":
    case "CLOSE_POLL":
      return text(details, "reason") === "MANUAL" ? "由管理员手动关闭" : null;

    case "POLL_AUTO_CLOSED":
      return "到达截止时间后由系统自动关闭";

    case "POLL_EXPORTED":
    case "EXPORT_POLL":
      return text(details, "format")?.toLowerCase() === "xlsx" ? "已导出 Excel 投票记录" : "已导出投票记录";

    default:
      return null;
  }
}
