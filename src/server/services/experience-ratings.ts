import { randomUUID } from "node:crypto";

import type { SessionUser } from "@/types";
import { ensureDatabaseReady } from "../db";
import type {
  ExperienceRatingContext,
  ExperienceRatingOutcome,
} from "../db/types";
import { DomainError } from "./errors";

export const EXPERIENCE_RATING_COOLDOWN_DAYS = 90;
const COOLDOWN_MS = EXPERIENCE_RATING_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
const ALLOWED_TAGS = new Set([
  "操作清晰",
  "页面响应顺畅",
  "材料查看方便",
  "语音输入好用",
  "操作不清楚",
  "页面响应较慢",
  "材料查看不方便",
  "语音输入有问题",
  "流程清晰",
  "进度查看方便",
  "关闭操作顺畅",
  "导出结果实用",
  "流程不清楚",
  "进度查看不方便",
  "关闭操作有问题",
  "导出结果不好用",
]);

export interface ExperienceRatingStatus {
  eligible: boolean;
  cooldownDays: number;
}

function assertContextAccess(
  context: ExperienceRatingContext,
  actor: SessionUser,
): void {
  if (context === "ADMIN" && actor.role !== "HR") {
    throw new DomainError("FORBIDDEN", "仅投票管理人员可以评价管理流程");
  }
  if (
    context === "MEMBER" &&
    actor.role !== "MEMBER" &&
    !actor.isCommitteeMember
  ) {
    throw new DomainError("FORBIDDEN", "仅投票委员可以评价投票流程");
  }
}

export async function getExperienceRatingStatus(
  context: ExperienceRatingContext,
  actor: SessionUser,
): Promise<ExperienceRatingStatus> {
  assertContextAccess(context, actor);
  const db = await ensureDatabaseReady();
  const last = await db
    .selectFrom("experience_ratings")
    .select("created_at")
    .where("user_id", "=", actor.id)
    .where("context", "=", context)
    .orderBy("created_at", "desc")
    .executeTakeFirst();

  return {
    eligible: !last || Date.now() - last.created_at.getTime() >= COOLDOWN_MS,
    cooldownDays: EXPERIENCE_RATING_COOLDOWN_DAYS,
  };
}

export async function recordExperienceRating(
  input: {
    context: ExperienceRatingContext;
    outcome: ExperienceRatingOutcome;
    score?: number;
    tags?: string[];
  },
  actor: SessionUser,
): Promise<ExperienceRatingStatus> {
  assertContextAccess(input.context, actor);
  if (input.tags?.some((tag) => !ALLOWED_TAGS.has(tag))) {
    throw new DomainError("VALIDATION_ERROR", "评价原因不在可选范围内");
  }
  const current = await getExperienceRatingStatus(input.context, actor);
  if (!current.eligible) return current;

  const db = await ensureDatabaseReady();
  await db
    .insertInto("experience_ratings")
    .values({
      id: randomUUID(),
      user_id: actor.id,
      context: input.context,
      outcome: input.outcome,
      score: input.outcome === "RATED" ? (input.score ?? null) : null,
      tags: JSON.stringify(input.outcome === "RATED" ? (input.tags ?? []) : []),
    })
    .execute();

  return { eligible: false, cooldownDays: EXPERIENCE_RATING_COOLDOWN_DAYS };
}
