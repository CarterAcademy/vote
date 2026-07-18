import { sql, type Kysely } from "kysely";

import type { DatabaseSchema } from "./types";

export async function migrateDatabase(db: Kysely<DatabaseSchema>): Promise<void> {
  await db.schema
    .createTable("users")
    .ifNotExists()
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("dingtalk_user_id", "varchar(128)", (column) =>
      column.notNull().unique(),
    )
    .addColumn("name", "varchar(100)", (column) => column.notNull())
    .addColumn("department", "varchar(200)")
    .addColumn("role", "varchar(20)", (column) => column.notNull())
    .addColumn("is_active", "boolean", (column) =>
      column.notNull().defaultTo(true),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addCheckConstraint("users_role_check", sql`role in ('HR', 'MEMBER')`)
    .execute();

  await db.schema
    .createTable("committees")
    .ifNotExists()
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("code", "varchar(30)", (column) => column.notNull().unique())
    .addColumn("name", "varchar(200)", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addCheckConstraint(
      "committees_code_check",
      sql`code in ('ACADEMIC', 'TECHNICAL')`,
    )
    .execute();

  await db.schema
    .createTable("committee_members")
    .ifNotExists()
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("committee_id", "uuid", (column) =>
      column.notNull().references("committees.id").onDelete("cascade"),
    )
    .addColumn("user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("restrict"),
    )
    .addColumn("position", "varchar(100)")
    .addColumn("display_order", "integer", (column) => column.notNull())
    .addColumn("is_active", "boolean", (column) =>
      column.notNull().defaultTo(true),
    )
    .addColumn("joined_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint("committee_members_unique", ["committee_id", "user_id"])
    .execute();

  await db.schema
    .createTable("polls")
    .ifNotExists()
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("committee_id", "uuid", (column) =>
      column.notNull().references("committees.id").onDelete("restrict"),
    )
    .addColumn("title", "varchar(300)", (column) => column.notNull())
    .addColumn("candidate_name", "varchar(100)", (column) => column.notNull())
    .addColumn("status", "varchar(20)", (column) =>
      column.notNull().defaultTo("OPEN"),
    )
    .addColumn("starts_at", "timestamptz", (column) => column.notNull())
    .addColumn("deadline_at", "timestamptz", (column) => column.notNull())
    .addColumn("closed_at", "timestamptz")
    .addColumn("closed_by_user_id", "uuid", (column) =>
      column.references("users.id").onDelete("restrict"),
    )
    .addColumn("close_reason", "varchar(20)")
    .addColumn("created_by_user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("restrict"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addCheckConstraint("polls_status_check", sql`status in ('OPEN', 'CLOSED')`)
    .addCheckConstraint(
      "polls_close_reason_check",
      sql`close_reason is null or close_reason in ('MANUAL', 'AUTOMATIC')`,
    )
    .addCheckConstraint("polls_deadline_check", sql`deadline_at > starts_at`)
    .execute();

  await db.schema
    .createTable("poll_voters")
    .ifNotExists()
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("poll_id", "uuid", (column) =>
      column.notNull().references("polls.id").onDelete("restrict"),
    )
    .addColumn("user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("restrict"),
    )
    .addColumn("dingtalk_user_id", "varchar(128)", (column) => column.notNull())
    .addColumn("voter_name", "varchar(100)", (column) => column.notNull())
    .addColumn("department", "varchar(200)")
    .addColumn("position", "varchar(100)")
    .addColumn("display_order", "integer", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint("poll_voters_poll_user_unique", ["poll_id", "user_id"])
    .execute();

  await db.schema
    .createTable("votes")
    .ifNotExists()
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("poll_id", "uuid", (column) =>
      column.notNull().references("polls.id").onDelete("restrict"),
    )
    .addColumn("poll_voter_id", "uuid", (column) =>
      column.notNull().references("poll_voters.id").onDelete("restrict"),
    )
    .addColumn("choice", "varchar(20)", (column) => column.notNull())
    .addColumn("opinion", "text")
    .addColumn("version", "integer", (column) => column.notNull().defaultTo(1))
    .addColumn("submitted_at", "timestamptz", (column) => column.notNull())
    .addColumn("updated_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("votes_poll_voter_unique", ["poll_id", "poll_voter_id"])
    .addCheckConstraint(
      "votes_choice_check",
      sql`choice in ('APPROVE', 'REJECT', 'ABSTAIN')`,
    )
    .addCheckConstraint("votes_version_check", sql`version >= 1`)
    .addCheckConstraint(
      "votes_opinion_check",
      sql`choice = 'ABSTAIN' or length(trim(coalesce(opinion, ''))) > 0`,
    )
    .execute();

  await db.schema
    .createTable("vote_revisions")
    .ifNotExists()
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("vote_id", "uuid", (column) =>
      column.notNull().references("votes.id").onDelete("restrict"),
    )
    .addColumn("poll_id", "uuid", (column) =>
      column.notNull().references("polls.id").onDelete("restrict"),
    )
    .addColumn("poll_voter_id", "uuid", (column) =>
      column.notNull().references("poll_voters.id").onDelete("restrict"),
    )
    .addColumn("revision_number", "integer", (column) => column.notNull())
    .addColumn("choice", "varchar(20)", (column) => column.notNull())
    .addColumn("opinion", "text")
    .addColumn("changed_by_user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("restrict"),
    )
    .addColumn("changed_at", "timestamptz", (column) => column.notNull())
    .addUniqueConstraint("vote_revisions_version_unique", [
      "vote_id",
      "revision_number",
    ])
    .addCheckConstraint(
      "vote_revisions_choice_check",
      sql`choice in ('APPROVE', 'REJECT', 'ABSTAIN')`,
    )
    .execute();

  await db.schema
    .createTable("reminder_logs")
    .ifNotExists()
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("poll_id", "uuid", (column) =>
      column.notNull().references("polls.id").onDelete("restrict"),
    )
    .addColumn("poll_voter_id", "uuid", (column) =>
      column.notNull().references("poll_voters.id").onDelete("restrict"),
    )
    .addColumn("triggered_by_user_id", "uuid", (column) =>
      column.references("users.id").onDelete("restrict"),
    )
    .addColumn("delivery_status", "varchar(20)", (column) => column.notNull())
    .addColumn("request_id", "varchar(200)")
    .addColumn("error_message", "text")
    .addColumn("sent_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addCheckConstraint(
      "reminder_logs_status_check",
      sql`delivery_status in ('PENDING', 'SENT', 'FAILED')`,
    )
    .execute();

  await db.schema
    .createTable("audit_logs")
    .ifNotExists()
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("actor_user_id", "uuid", (column) =>
      column.references("users.id").onDelete("set null"),
    )
    .addColumn("action", "varchar(100)", (column) => column.notNull())
    .addColumn("entity_type", "varchar(100)", (column) => column.notNull())
    .addColumn("entity_id", "uuid", (column) => column.notNull())
    .addColumn("details", "jsonb", (column) =>
      column.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await Promise.all([
    db.schema
      .createIndex("polls_lookup_idx")
      .ifNotExists()
      .on("polls")
      .columns(["status", "deadline_at"])
      .execute(),
    db.schema
      .createIndex("polls_candidate_idx")
      .ifNotExists()
      .on("polls")
      .column("candidate_name")
      .execute(),
    db.schema
      .createIndex("poll_voters_user_idx")
      .ifNotExists()
      .on("poll_voters")
      .columns(["user_id", "poll_id"])
      .execute(),
    db.schema
      .createIndex("audit_logs_entity_idx")
      .ifNotExists()
      .on("audit_logs")
      .columns(["entity_type", "entity_id", "created_at"])
      .execute(),
  ]);
}
