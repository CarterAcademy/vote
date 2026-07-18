import type { PollStatus, VoteChoice } from "./types";

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const compactDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDateTime(value?: string | null): string {
  if (!value) return "未设置";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return dateTimeFormatter.format(date).replaceAll("/", "-");
}

export function formatCompactDate(value?: string | null): string {
  if (!value) return "未设置";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return compactDateFormatter.format(date).replaceAll("/", "-");
}

export function isPast(value?: string | null): boolean {
  if (!value) return false;
  return new Date(value).getTime() <= Date.now();
}

export function pollStatusLabel(status: PollStatus, deadlineAt?: string): string {
  if (status === "CLOSED") return "已关闭";
  if (isPast(deadlineAt)) return "已截止";
  return "进行中";
}

export const choiceLabels: Record<VoteChoice, string> = {
  APPROVE: "通过",
  REJECT: "不通过",
  ABSTAIN: "弃权",
};

export function choiceLabel(choice?: VoteChoice | null): string {
  return choice ? choiceLabels[choice] : "未投票";
}

export function localDateTimeInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function percent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%`;
}

