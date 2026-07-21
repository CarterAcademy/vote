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
    .execute();

  // Older installations limited committees to two fixed codes. Committee
  // codes are now opaque stable identifiers so administrators can create
  // additional groups without changing the schema.
  try {
    await db.schema
      .alterTable("committees")
      .dropConstraint("committees_code_check")
      .execute();
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "42704" && !String(error).includes("does not exist")) throw error;
  }

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
      column.references("committees.id").onDelete("restrict"),
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

  // A poll may use only directly selected voters and therefore have no
  // committee. Existing installations originally required this column.
  await db.schema
    .alterTable("polls")
    .alterColumn("committee_id", (column) => column.dropNotNull())
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
    .createTable("poll_attachments")
    .ifNotExists()
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("poll_id", "uuid", (column) =>
      column.notNull().references("polls.id").onDelete("restrict"),
    )
    .addColumn("original_name", "varchar(255)", (column) => column.notNull())
    .addColumn("stored_name", "varchar(100)", (column) => column.notNull().unique())
    .addColumn("content_type", "varchar(150)", (column) => column.notNull())
    .addColumn("size_bytes", "integer", (column) => column.notNull())
    .addColumn("preview_text", "text")
    .addColumn("display_order", "integer", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint("poll_attachments_poll_order_unique", ["poll_id", "display_order"])
    .addCheckConstraint("poll_attachments_size_check", sql`size_bytes > 0`)
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
    .createTable("vote_voice_recordings")
    .ifNotExists()
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("poll_id", "uuid", (column) =>
      column.notNull().references("polls.id").onDelete("restrict"),
    )
    .addColumn("poll_voter_id", "uuid", (column) =>
      column.notNull().references("poll_voters.id").onDelete("restrict"),
    )
    .addColumn("vote_id", "uuid", (column) =>
      column.references("votes.id").onDelete("restrict"),
    )
    .addColumn("created_by_user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("restrict"),
    )
    .addColumn("stored_name", "varchar(100)", (column) => column.notNull().unique())
    .addColumn("content_type", "varchar(100)", (column) => column.notNull())
    .addColumn("size_bytes", "integer", (column) => column.notNull())
    .addColumn("transcript", "text", (column) => column.notNull())
    .addColumn("status", "varchar(20)", (column) =>
      column.notNull().defaultTo("DRAFT"),
    )
    .addColumn("is_active", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("submitted_version", "integer")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addCheckConstraint("vote_voice_recordings_size_check", sql`size_bytes > 0`)
    .addCheckConstraint(
      "vote_voice_recordings_status_check",
      sql`status in ('DRAFT', 'SUBMITTED')`,
    )
    .addCheckConstraint(
      "vote_voice_recordings_submission_check",
      sql`(status = 'DRAFT' and vote_id is null and submitted_version is null and is_active = false) or (status = 'SUBMITTED' and vote_id is not null and submitted_version is not null)`,
    )
    .execute();

  await db.schema
    .createIndex("vote_voice_recordings_poll_voter_idx")
    .ifNotExists()
    .on("vote_voice_recordings")
    .columns(["poll_id", "poll_voter_id"])
    .execute();

  await db.schema
    .createIndex("vote_voice_recordings_active_vote_idx")
    .ifNotExists()
    .on("vote_voice_recordings")
    .columns(["vote_id", "is_active"])
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
    .addColumn("notification_type", "varchar(30)", (column) =>
      column.notNull().defaultTo("MANUAL"),
    )
    .addColumn("scheduled_for", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
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

  // Upgrade reminder logs created by releases that only supported manual
  // reminders. Defaults preserve their original meaning and make the migration
  // safe for a populated production database.
  await sql`
    alter table reminder_logs
      add column if not exists notification_type varchar(30) not null default 'MANUAL'
  `.execute(db);
  await sql`
    alter table reminder_logs
      add column if not exists scheduled_for timestamptz not null default now()
  `.execute(db);

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

  await db.schema
    .createTable("intro_comment_visitors")
    .ifNotExists()
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("ip_hash", "varchar(64)", (column) => column.notNull().unique())
    .addColumn("nickname", "varchar(100)", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("intro_comments")
    .ifNotExists()
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("author_user_id", "uuid", (column) =>
      column.references("users.id").onDelete("set null"),
    )
    .addColumn("anonymous_visitor_id", "uuid", (column) =>
      column.references("intro_comment_visitors.id").onDelete("restrict"),
    )
    .addColumn("content", "text", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addCheckConstraint(
      "intro_comments_author_check",
      sql`(author_user_id is not null and anonymous_visitor_id is null) or (author_user_id is null and anonymous_visitor_id is not null)`,
    )
    .addCheckConstraint(
      "intro_comments_content_check",
      sql`length(trim(content)) between 1 and 1000`,
    )
    .execute();

  await db.schema
    .createTable("experience_ratings")
    .ifNotExists()
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("restrict"),
    )
    .addColumn("context", "varchar(20)", (column) => column.notNull())
    .addColumn("outcome", "varchar(20)", (column) => column.notNull())
    .addColumn("score", "integer")
    .addColumn("tags", "jsonb", (column) =>
      column.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .addCheckConstraint(
      "experience_ratings_context_check",
      sql`context in ('MEMBER', 'ADMIN')`,
    )
    .addCheckConstraint(
      "experience_ratings_outcome_check",
      sql`outcome in ('RATED', 'DISMISSED')`,
    )
    .addCheckConstraint(
      "experience_ratings_score_check",
      sql`(outcome = 'RATED' and score between 1 and 5) or (outcome = 'DISMISSED' and score is null)`,
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
      .createIndex("poll_attachments_poll_idx")
      .ifNotExists()
      .on("poll_attachments")
      .columns(["poll_id", "display_order"])
      .execute(),
    db.schema
      .createIndex("audit_logs_entity_idx")
      .ifNotExists()
      .on("audit_logs")
      .columns(["entity_type", "entity_id", "created_at"])
      .execute(),
    db.schema
      .createIndex("reminder_logs_delivery_unique_idx")
      .ifNotExists()
      .unique()
      .on("reminder_logs")
      .columns(["poll_voter_id", "notification_type", "scheduled_for"])
      .where("notification_type", "!=", "MANUAL")
      .execute(),
    db.schema
      .createIndex("intro_comments_created_idx")
      .ifNotExists()
      .on("intro_comments")
      .column("created_at")
      .execute(),
    db.schema
      .createIndex("experience_ratings_user_context_idx")
      .ifNotExists()
      .on("experience_ratings")
      .columns(["user_id", "context", "created_at"])
      .execute(),
  ]);
}
