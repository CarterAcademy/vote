import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { z } from "zod";

import { closeDatabase, ensureDatabaseReady } from "../src/server/db";

const inputSchema = z.object({
  dingtalkUserId: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(100),
  department: z.string().trim().max(200).nullable(),
});

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      confirm: { type: "boolean", default: false },
    },
  });

  if (!values.confirm) {
    throw new Error(
      "This writes the configured development administrator to the connected database; re-run with --confirm.",
    );
  }

  const input = inputSchema.parse({
    dingtalkUserId: process.env.DINGTALK_DEV_ADMIN_USER_ID,
    name: process.env.DINGTALK_DEV_ADMIN_NAME,
    department: process.env.DINGTALK_DEV_ADMIN_DEPARTMENT?.trim() || null,
  });
  const db = await ensureDatabaseReady();

  const outcome = await db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom("users")
      .select(["id", "role", "is_active"])
      .where("dingtalk_user_id", "=", input.dingtalkUserId)
      .executeTakeFirst();

    if (existing?.role === "MEMBER") {
      throw new Error(
        "The configured DingTalk account is already a committee member; refusing to change it to HR automatically.",
      );
    }

    const userId = existing?.id ?? randomUUID();
    if (existing) {
      await trx
        .updateTable("users")
        .set({
          name: input.name,
          department: input.department,
          is_active: true,
          updated_at: new Date(),
        })
        .where("id", "=", userId)
        .executeTakeFirstOrThrow();
    } else {
      await trx
        .insertInto("users")
        .values({
          id: userId,
          dingtalk_user_id: input.dingtalkUserId,
          name: input.name,
          department: input.department,
          role: "HR",
        })
        .executeTakeFirstOrThrow();
    }

    const action = existing
      ? existing.is_active
        ? "DEV_ADMIN_REFRESHED"
        : "DEV_ADMIN_REACTIVATED"
      : "DEV_ADMIN_ADDED";

    await trx
      .insertInto("audit_logs")
      .values({
        id: randomUUID(),
        actor_user_id: null,
        action,
        entity_type: "USER",
        entity_id: userId,
        details: { source: "remote-real-data-dev" },
      })
      .executeTakeFirstOrThrow();

    return action;
  });

  process.stdout.write(
    `${JSON.stringify({ success: true, outcome, auditRecorded: true })}\n`,
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
