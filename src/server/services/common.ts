import { randomUUID } from "node:crypto";

import type { Kysely } from "kysely";

import type { SessionUser } from "@/types";

import type { DatabaseSchema } from "../db";
import { DomainError } from "./errors";

export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function optionalIso(value: Date | string | null): string | null {
  return value ? toIso(value) : null;
}

export function assertHr(actor: SessionUser): void {
  if (actor.role !== "HR") {
    throw new DomainError("FORBIDDEN", "仅 HR 可以执行此操作");
  }
}

export async function writeAuditLog(
  db: Kysely<DatabaseSchema>,
  input: {
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    details?: Record<string, unknown>;
    createdAt?: Date;
  },
): Promise<void> {
  await db
    .insertInto("audit_logs")
    .values({
      id: randomUUID(),
      actor_user_id: input.actorUserId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId,
      details: input.details ?? {},
      ...(input.createdAt ? { created_at: input.createdAt } : {}),
    })
    .execute();
}

