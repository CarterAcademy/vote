import { randomUUID } from "node:crypto";

import { sql } from "kysely";
import type { SessionUser } from "@/types";

import {
  ensureDatabaseReady,
  type PollCloseReason,
  type PollStatus,
  type VoteChoice,
} from "../db";
import {
  createPollSchema,
  pollListQuerySchema,
  type CreatePollInput,
  type PollListQuery,
} from "../validation";
import { assertHr, optionalIso, toIso, writeAuditLog } from "./common";
import { DomainError } from "./errors";
import { sendPollLaunchNotifications } from "./reminders";
import { calculateVoteStats, type PollStats } from "./stats";
import type { PreparedPollAttachment } from "../files/attachments";
import { listActiveVoiceRecordings, type VoiceRecordingDto } from "./voice-recordings";

export interface PollAttachmentDto {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
}

export interface PollAttachmentRecord extends PollAttachmentDto {
  storedName: string;
  previewText: string | null;
}

export interface CommitteeDto {
  id: string;
  code: string;
  name: string;
  memberCount: number;
}

export interface PollDto {
  id: string;
  committeeId: string | null;
  committeeName: string;
  title: string;
  candidateName: string;
  status: PollStatus;
  startsAt: string;
  deadlineAt: string;
  closedAt: string | null;
  closeReason: PollCloseReason | null;
  createdByName: string;
  createdAt: string;
  canEdit: boolean;
  attachments: PollAttachmentDto[];
}

export interface PollListItem extends PollDto {
  submittedCount?: number;
  totalVoters?: number;
  hasVoted?: boolean;
}

export interface PollListResult {
  items: PollListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PollDashboardStats {
  active: number;
  total: number;
  closed: number;
  turnout: number;
}

export async function getPollDashboardStats(
  actor: SessionUser,
  scope: "OWN" | "ALL" = "OWN",
): Promise<PollDashboardStats> {
  assertHr(actor);
  const db = await ensureDatabaseReady();
  let query = db
    .selectFrom("polls")
    .leftJoin("poll_voters", "poll_voters.poll_id", "polls.id")
    .leftJoin("votes", "votes.poll_voter_id", "poll_voters.id")
    .select([
      sql<number>`count(distinct polls.id)`.as("total"),
      sql<number>`count(distinct case when polls.status = 'OPEN' and polls.deadline_at > now() then polls.id end)`.as("active"),
      sql<number>`count(distinct poll_voters.id)`.as("eligible"),
      sql<number>`count(distinct votes.id)`.as("submitted"),
    ]);
  if (scope === "OWN") {
    query = query.where("polls.created_by_user_id", "=", actor.id);
  }
  const row = await query.executeTakeFirstOrThrow();
  const total = Number(row.total);
  const active = Number(row.active);
  const eligible = Number(row.eligible);
  const submitted = Number(row.submitted);
  return {
    active,
    total,
    closed: total - active,
    turnout: eligible ? Math.round((submitted / eligible) * 1000) / 10 : 0,
  };
}

export interface HrVoterDto {
  id: string;
  userId: string;
  name: string;
  department: string | null;
  position: string | null;
  hasVoted: boolean;
  choice: VoteChoice | null;
  opinion: string | null;
  version: number | null;
  submittedAt: string | null;
  updatedAt: string | null;
  voiceRecordings: VoiceRecordingDto[];
}

export interface AuditLogDto {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: string;
  details: Record<string, unknown>;
}

export interface HrPollDetail {
  poll: PollDto;
  stats: PollStats;
  voters: HrVoterDto[];
  auditLogs: AuditLogDto[];
}

export interface MemberPollDetail {
  poll: PollDto;
  myVote: {
    id: string;
    choice: VoteChoice;
    opinion: string | null;
    version: number;
    submittedAt: string;
    updatedAt: string;
    voiceRecordings: VoiceRecordingDto[];
  } | null;
  canEdit: boolean;
}

export interface MissingVoter {
  pollVoterId: string;
  userId: string;
  dingtalkUserId: string;
  name: string;
  department: string | null;
}

function effectiveStatus(
  status: PollStatus,
  deadlineAt: Date | string,
  now = new Date(),
): PollStatus {
  return status === "OPEN" && new Date(deadlineAt) <= now ? "CLOSED" : status;
}

function mapPoll(
  row: {
    id: string;
    committee_id: string | null;
    committee_name: string | null;
    title: string;
    candidate_name: string;
    status: PollStatus;
    starts_at: Date;
    deadline_at: Date;
    closed_at: Date | null;
    close_reason: PollCloseReason | null;
    created_by_name: string;
    created_at: Date;
  },
  now = new Date(),
  attachments: PollAttachmentDto[] = [],
): PollDto {
  const status = effectiveStatus(row.status, row.deadline_at, now);
  return {
    id: row.id,
    committeeId: row.committee_id,
    committeeName: row.committee_name ?? "自选评审人",
    title: row.title,
    candidateName: row.candidate_name,
    status,
    startsAt: toIso(row.starts_at),
    deadlineAt: toIso(row.deadline_at),
    closedAt: optionalIso(row.closed_at),
    closeReason: row.close_reason,
    createdByName: row.created_by_name,
    createdAt: toIso(row.created_at),
    canEdit: status === "OPEN" && new Date(row.deadline_at) > now,
    attachments,
  };
}

async function listPollAttachments(pollIds: string[]): Promise<Map<string, PollAttachmentDto[]>> {
  const byPoll = new Map<string, PollAttachmentDto[]>();
  if (pollIds.length === 0) return byPoll;
  const db = await ensureDatabaseReady();
  const rows = await db
    .selectFrom("poll_attachments")
    .select(["id", "poll_id", "original_name", "content_type", "size_bytes"])
    .where("poll_id", "in", pollIds)
    .orderBy("poll_id", "asc")
    .orderBy("display_order", "asc")
    .execute();
  for (const row of rows) {
    const attachments = byPoll.get(row.poll_id) ?? [];
    attachments.push({
      id: row.id,
      name: row.original_name,
      contentType: row.content_type,
      sizeBytes: Number(row.size_bytes),
    });
    byPoll.set(row.poll_id, attachments);
  }
  return byPoll;
}

export async function listCommittees(): Promise<CommitteeDto[]> {
  const db = await ensureDatabaseReady();
  const rows = await db
    .selectFrom("committees")
    .leftJoin("committee_members", (join) =>
      join
        .onRef("committee_members.committee_id", "=", "committees.id")
        .on("committee_members.is_active", "=", true),
    )
    .select([
      "committees.id",
      "committees.code",
      "committees.name",
      (expression) =>
        expression.fn.count("committee_members.id").as("member_count"),
    ])
    .groupBy(["committees.id", "committees.code", "committees.name"])
    .orderBy("committees.code", "asc")
    .execute();

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    memberCount: Number(row.member_count),
  }));
}

export async function createPoll(
  input: CreatePollInput | unknown,
  actor: SessionUser,
  attachments: PreparedPollAttachment[] = [],
): Promise<PollDto> {
  assertHr(actor);
  const parsed = createPollSchema.parse(input);
  const db = await ensureDatabaseReady();
  const pollId = randomUUID();
  const startsAt = parsed.startsAt ?? new Date();

  const row = await db.transaction().execute(async (transaction) => {
    const committee = parsed.committeeId
      ? await transaction
          .selectFrom("committees")
          .select(["id", "name"])
          .where("id", "=", parsed.committeeId)
          .executeTakeFirst()
      : null;
    if (parsed.committeeId && !committee) {
      throw new DomainError("NOT_FOUND", "委员会不存在");
    }

    const committeeMembers = parsed.committeeId
      ? await transaction
          .selectFrom("committee_members")
          .innerJoin("users", "users.id", "committee_members.user_id")
          .select([
            "users.id as user_id",
            "users.dingtalk_user_id",
            "users.name",
            "users.department",
            "committee_members.position",
            "committee_members.display_order",
          ])
          .where("committee_members.committee_id", "=", parsed.committeeId)
          .where("committee_members.is_active", "=", true)
          .where("users.is_active", "=", true)
          .orderBy("committee_members.display_order", "asc")
          .execute()
      : [];

    const mergedVoters = new Map(committeeMembers.map((member) => [member.dingtalk_user_id, member]));
    for (const directVoter of parsed.directVoters) {
      let user = await transaction
        .selectFrom("users")
        .select(["id", "department"])
        .where("dingtalk_user_id", "=", directVoter.dingtalkUserId)
        .executeTakeFirst();

      if (!user) {
        user = {
          id: randomUUID(),
          department: directVoter.department?.trim() || null,
        };
        await transaction.insertInto("users").values({
          id: user.id,
          dingtalk_user_id: directVoter.dingtalkUserId,
          name: directVoter.name,
          department: user.department,
          role: "MEMBER",
        }).execute();
      } else {
        await transaction.updateTable("users").set({
          name: directVoter.name,
          department: directVoter.department?.trim() || user.department,
          is_active: true,
          updated_at: new Date(),
        }).where("id", "=", user.id).execute();
      }

      if (!mergedVoters.has(directVoter.dingtalkUserId)) {
        mergedVoters.set(directVoter.dingtalkUserId, {
          user_id: user.id,
          dingtalk_user_id: directVoter.dingtalkUserId,
          name: directVoter.name,
          department: directVoter.department?.trim() || user.department,
          position: directVoter.position?.trim() || "评审人",
          display_order: mergedVoters.size,
        });
      }
    }
    const voters = Array.from(mergedVoters.values());
    if (voters.length === 0) {
      throw new DomainError("NO_ACTIVE_MEMBERS", "请至少选择一名可参与投票的评审人");
    }

    await transaction
      .insertInto("polls")
      .values({
        id: pollId,
        committee_id: parsed.committeeId,
        title: parsed.title,
        candidate_name: parsed.candidateName,
        status: "OPEN",
        starts_at: startsAt,
        deadline_at: parsed.deadlineAt,
        closed_at: null,
        closed_by_user_id: null,
        close_reason: null,
        created_by_user_id: actor.id,
      })
      .execute();

    if (attachments.length > 0) {
      await transaction
        .insertInto("poll_attachments")
        .values(attachments.map((attachment) => ({
          id: attachment.id,
          poll_id: pollId,
          original_name: attachment.originalName,
          stored_name: attachment.storedName,
          content_type: attachment.contentType,
          size_bytes: attachment.sizeBytes,
          preview_text: attachment.previewText,
          display_order: attachment.displayOrder,
        })))
        .execute();
    }

    await transaction
      .insertInto("poll_voters")
      .values(
        voters.map((member, index) => ({
          id: randomUUID(),
          poll_id: pollId,
          user_id: member.user_id,
          dingtalk_user_id: member.dingtalk_user_id,
          voter_name: member.name,
          department: member.department,
          position: member.position,
          display_order: index + 1,
        })),
      )
      .execute();

    await writeAuditLog(transaction, {
      actorUserId: actor.id,
      action: "POLL_CREATED",
      entityType: "POLL",
      entityId: pollId,
      details: {
        committeeId: parsed.committeeId,
        committeeName: committee?.name ?? null,
        directVoterCount: parsed.directVoters.length,
        title: parsed.title,
        candidateName: parsed.candidateName,
        deadlineAt: parsed.deadlineAt.toISOString(),
        voterCount: voters.length,
        attachments: attachments.map((attachment) => attachment.originalName),
      },
    });

    return transaction
      .selectFrom("polls")
      .leftJoin("committees", "committees.id", "polls.committee_id")
      .innerJoin("users as creators", "creators.id", "polls.created_by_user_id")
      .select([
        "polls.id",
        "polls.committee_id",
        "committees.name as committee_name",
        "polls.title",
        "polls.candidate_name",
        "polls.status",
        "polls.starts_at",
        "polls.deadline_at",
        "polls.closed_at",
        "polls.close_reason",
        "creators.name as created_by_name",
        "polls.created_at",
      ])
      .where("polls.id", "=", pollId)
      .executeTakeFirstOrThrow();
  });

  const poll = mapPoll(row, new Date(), attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.originalName,
    contentType: attachment.contentType,
    sizeBytes: attachment.sizeBytes,
  })));
  try {
    await sendPollLaunchNotifications(poll.id, new Date(row.created_at));
  } catch (error) {
    // The poll is already committed at this point. A notification subsystem
    // outage must not turn a successful launch into a misleading API failure
    // that could cause the initiator to create a duplicate poll.
    await writeAuditLog(db, {
      actorUserId: actor.id,
      action: "POLL_LAUNCH_NOTIFICATIONS_FAILED",
      entityType: "POLL",
      entityId: poll.id,
      details: {
        error: error instanceof Error ? error.message : "钉钉通知发送失败",
      },
    }).catch(() => undefined);
  }
  return poll;
}

export async function listPolls(
  input: Partial<PollListQuery> | unknown,
  actor: SessionUser,
): Promise<PollListResult> {
  const query = pollListQuerySchema.parse(input ?? {});
  const db = await ensureDatabaseReady();

  let base = db
    .selectFrom("polls")
    .leftJoin("committees", "committees.id", "polls.committee_id")
    .innerJoin("users as creators", "creators.id", "polls.created_by_user_id")
    .$if(actor.role === "MEMBER" || query.scope === "ELIGIBLE", (builder) =>
      builder
        .innerJoin("poll_voters as eligibility", "eligibility.poll_id", "polls.id")
        .where("eligibility.user_id", "=", actor.id),
    )
    .$if(actor.role === "HR" && query.scope === "OWN", (builder) =>
      builder.where("polls.created_by_user_id", "=", actor.id),
    )
    .select([
      "polls.id",
      "polls.committee_id",
      "committees.name as committee_name",
      "polls.title",
      "polls.candidate_name",
      "polls.status",
      "polls.starts_at",
      "polls.deadline_at",
      "polls.closed_at",
      "polls.close_reason",
      "creators.name as created_by_name",
      "polls.created_at",
    ]);

  if (query.status) base = base.where("polls.status", "=", query.status);
  if (query.committeeId) {
    base = base.where("polls.committee_id", "=", query.committeeId);
  }
  if (query.search) {
    const pattern = `%${query.search}%`;
    base = base.where((expression) =>
      expression.or([
        expression("polls.title", "ilike", pattern),
        expression("polls.candidate_name", "ilike", pattern),
      ]),
    );
  }
  if (query.from) base = base.where("polls.created_at", ">=", query.from);
  if (query.to) base = base.where("polls.created_at", "<=", query.to);

  const countRow = await base
    .clearSelect()
    .select((expression) => expression.fn.countAll().as("count"))
    .executeTakeFirstOrThrow();
  const rows = await base
    .orderBy("polls.created_at", "desc")
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
    .execute();
  const pollIds = rows.map((row) => row.id);

  const attachmentsByPoll = await listPollAttachments(pollIds);
  const items: PollListItem[] = rows.map((row) =>
    mapPoll(row, new Date(), attachmentsByPoll.get(row.id) ?? []),
  );
  if (pollIds.length > 0 && actor.role === "HR" && query.scope !== "ELIGIBLE") {
    const counts = await db
      .selectFrom("poll_voters")
      .leftJoin("votes", "votes.poll_voter_id", "poll_voters.id")
      .select([
        "poll_voters.poll_id",
        (expression) => expression.fn.count("poll_voters.id").as("total"),
        (expression) => expression.fn.count("votes.id").as("submitted"),
      ])
      .where("poll_voters.poll_id", "in", pollIds)
      .groupBy("poll_voters.poll_id")
      .execute();
    const byPoll = new Map(counts.map((row) => [row.poll_id, row]));
    for (const item of items) {
      const count = byPoll.get(item.id);
      item.totalVoters = Number(count?.total ?? 0);
      item.submittedCount = Number(count?.submitted ?? 0);
    }
  } else if (pollIds.length > 0) {
    const submitted = await db
      .selectFrom("poll_voters")
      .leftJoin("votes", "votes.poll_voter_id", "poll_voters.id")
      .select(["poll_voters.poll_id", "votes.id as vote_id"])
      .where("poll_voters.poll_id", "in", pollIds)
      .where("poll_voters.user_id", "=", actor.id)
      .execute();
    const byPoll = new Map(
      submitted.map((row) => [row.poll_id, Boolean(row.vote_id)]),
    );
    for (const item of items) item.hasVoted = byPoll.get(item.id) ?? false;
  }

  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total: Number(countRow.count),
  };
}

async function getBasePoll(pollId: string) {
  const db = await ensureDatabaseReady();
  return db
    .selectFrom("polls")
    .leftJoin("committees", "committees.id", "polls.committee_id")
    .innerJoin("users as creators", "creators.id", "polls.created_by_user_id")
    .select([
      "polls.id",
      "polls.committee_id",
      "committees.name as committee_name",
      "polls.title",
      "polls.candidate_name",
      "polls.status",
      "polls.starts_at",
      "polls.deadline_at",
      "polls.closed_at",
      "polls.close_reason",
      "creators.name as created_by_name",
      "polls.created_at",
    ])
    .where("polls.id", "=", pollId)
    .executeTakeFirst();
}

export async function getPollDetail(
  pollId: string,
  actor: SessionUser & { role: "HR" },
): Promise<HrPollDetail>;
export async function getPollDetail(
  pollId: string,
  actor: SessionUser & { role: "MEMBER" },
): Promise<MemberPollDetail>;
export async function getPollDetail(
  pollId: string,
  actor: SessionUser,
): Promise<HrPollDetail | MemberPollDetail>;
export async function getPollDetail(
  pollId: string,
  actor: SessionUser,
): Promise<HrPollDetail | MemberPollDetail> {
  const db = await ensureDatabaseReady();
  const row = await getBasePoll(pollId);
  if (!row) throw new DomainError("NOT_FOUND", "投票不存在");
  const attachmentsByPoll = await listPollAttachments([pollId]);
  const poll = mapPoll(row, new Date(), attachmentsByPoll.get(pollId) ?? []);

  if (actor.role === "MEMBER") {
    const voter = await db
      .selectFrom("poll_voters")
      .leftJoin("votes", "votes.poll_voter_id", "poll_voters.id")
      .select([
        "poll_voters.id as poll_voter_id",
        "votes.id as vote_id",
        "votes.choice",
        "votes.opinion",
        "votes.version",
        "votes.submitted_at",
        "votes.updated_at",
      ])
      .where("poll_voters.poll_id", "=", pollId)
      .where("poll_voters.user_id", "=", actor.id)
      .executeTakeFirst();
    if (!voter) {
      throw new DomainError("NOT_ELIGIBLE", "您不在本次投票的委员名单中");
    }
    const recordings = await listActiveVoiceRecordings(pollId);

    return {
      poll,
      canEdit: poll.canEdit,
      myVote:
        voter.vote_id &&
        voter.choice &&
        voter.version &&
        voter.submitted_at &&
        voter.updated_at
          ? {
              id: voter.vote_id,
              choice: voter.choice,
              opinion: voter.opinion,
              version: voter.version,
              submittedAt: toIso(voter.submitted_at),
              updatedAt: toIso(voter.updated_at),
              voiceRecordings: recordings.get(voter.poll_voter_id) ?? [],
            }
          : null,
    };
  }

  assertHr(actor);
  const voters = await db
    .selectFrom("poll_voters")
    .leftJoin("votes", "votes.poll_voter_id", "poll_voters.id")
    .leftJoin("users", "users.id", "poll_voters.user_id")
    .select([
      "poll_voters.id",
      "poll_voters.user_id",
      "poll_voters.voter_name",
      "poll_voters.department",
      "users.department as current_department",
      "poll_voters.position",
      "votes.id as vote_id",
      "votes.choice",
      "votes.opinion",
      "votes.version",
      "votes.submitted_at",
      "votes.updated_at",
    ])
    .where("poll_voters.poll_id", "=", pollId)
    .orderBy("poll_voters.display_order", "asc")
    .execute();

  const auditRows = await db
    .selectFrom("audit_logs")
    .leftJoin("users", "users.id", "audit_logs.actor_user_id")
    .select([
      "audit_logs.id",
      "audit_logs.action",
      "audit_logs.details",
      "audit_logs.created_at",
      "users.name as actor_name",
    ])
    .where("audit_logs.entity_type", "=", "POLL")
    .where("audit_logs.entity_id", "=", pollId)
    .orderBy("audit_logs.created_at", "desc")
    .execute();
  const recordings = await listActiveVoiceRecordings(pollId);

  const choices = voters
    .map((voter) => voter.choice)
    .filter((choice): choice is VoteChoice => choice !== null);

  return {
    poll,
    stats: calculateVoteStats(voters.length, choices),
    voters: voters.map((voter) => ({
      id: voter.id,
      userId: voter.user_id,
      name: voter.voter_name,
      department: voter.department ?? voter.current_department,
      position: voter.position,
      hasVoted: Boolean(voter.vote_id),
      choice: voter.choice,
      opinion: voter.opinion,
      version: voter.version,
      submittedAt: voter.submitted_at ? toIso(voter.submitted_at) : null,
      updatedAt: voter.updated_at ? toIso(voter.updated_at) : null,
      voiceRecordings: recordings.get(voter.id) ?? [],
    })),
    auditLogs: auditRows.map((audit) => ({
      id: audit.id,
      action: audit.action,
      actorName: audit.actor_name ?? null,
      createdAt: toIso(audit.created_at),
      details: audit.details,
    })),
  };
}

/** Return the caller's own ballot view, including for HR users who are also voters. */
export async function getMemberPollDetail(
  pollId: string,
  actor: SessionUser,
): Promise<MemberPollDetail> {
  return getPollDetail(pollId, { ...actor, role: "MEMBER" });
}

export async function getPollAttachment(
  pollId: string,
  attachmentId: string,
  actor: SessionUser,
): Promise<PollAttachmentRecord> {
  const db = await ensureDatabaseReady();
  const query = db
    .selectFrom("poll_attachments")
    .innerJoin("polls", "polls.id", "poll_attachments.poll_id")
    .$if(actor.role === "MEMBER", (builder) =>
      builder
        .innerJoin("poll_voters", "poll_voters.poll_id", "polls.id")
        .where("poll_voters.user_id", "=", actor.id),
    )
    .select([
      "poll_attachments.id",
      "poll_attachments.original_name",
      "poll_attachments.stored_name",
      "poll_attachments.content_type",
      "poll_attachments.size_bytes",
      "poll_attachments.preview_text",
    ])
    .where("poll_attachments.poll_id", "=", pollId)
    .where("poll_attachments.id", "=", attachmentId);

  const row = await query.executeTakeFirst();
  if (!row) throw new DomainError("NOT_FOUND", "附件不存在或无权访问");
  return {
    id: row.id,
    name: row.original_name,
    storedName: row.stored_name,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    previewText: row.preview_text,
  };
}

export async function listMissingVoters(
  pollId: string,
  actor: SessionUser,
): Promise<MissingVoter[]> {
  assertHr(actor);
  const db = await ensureDatabaseReady();
  const exists = await db
    .selectFrom("polls")
    .select("id")
    .where("id", "=", pollId)
    .executeTakeFirst();
  if (!exists) throw new DomainError("NOT_FOUND", "投票不存在");

  const rows = await db
    .selectFrom("poll_voters")
    .leftJoin("votes", "votes.poll_voter_id", "poll_voters.id")
    .select([
      "poll_voters.id",
      "poll_voters.user_id",
      "poll_voters.dingtalk_user_id",
      "poll_voters.voter_name",
      "poll_voters.department",
    ])
    .where("poll_voters.poll_id", "=", pollId)
    .where("votes.id", "is", null)
    .orderBy("poll_voters.display_order", "asc")
    .execute();

  return rows.map((row) => ({
    pollVoterId: row.id,
    userId: row.user_id,
    dingtalkUserId: row.dingtalk_user_id,
    name: row.voter_name,
    department: row.department,
  }));
}

export async function closePoll(
  pollId: string,
  actor: SessionUser,
): Promise<PollDto> {
  assertHr(actor);
  const db = await ensureDatabaseReady();
  const now = new Date();

  await db.transaction().execute(async (transaction) => {
    const poll = await transaction
      .selectFrom("polls")
      .select(["id", "status"])
      .where("id", "=", pollId)
      .forUpdate()
      .executeTakeFirst();
    if (!poll) throw new DomainError("NOT_FOUND", "投票不存在");
    if (poll.status === "CLOSED") return;

    await transaction
      .updateTable("polls")
      .set({
        status: "CLOSED",
        closed_at: now,
        closed_by_user_id: actor.id,
        close_reason: "MANUAL",
        updated_at: now,
      })
      .where("id", "=", pollId)
      .execute();
    await writeAuditLog(transaction, {
      actorUserId: actor.id,
      action: "POLL_CLOSED",
      entityType: "POLL",
      entityId: pollId,
      details: { reason: "MANUAL" },
      createdAt: now,
    });
  });

  const row = await getBasePoll(pollId);
  if (!row) throw new DomainError("NOT_FOUND", "投票不存在");
  return mapPoll(row, now);
}

export async function closeExpiredPolls(
  now = new Date(),
): Promise<{ closedCount: number; pollIds: string[] }> {
  const db = await ensureDatabaseReady();

  return db.transaction().execute(async (transaction) => {
    const expired = await transaction
      .selectFrom("polls")
      .select("id")
      .where("status", "=", "OPEN")
      .where("deadline_at", "<=", now)
      .forUpdate()
      .execute();
    if (expired.length === 0) return { closedCount: 0, pollIds: [] };
    const pollIds = expired.map((poll) => poll.id);

    await transaction
      .updateTable("polls")
      .set({
        status: "CLOSED",
        closed_at: now,
        closed_by_user_id: null,
        close_reason: "AUTOMATIC",
        updated_at: now,
      })
      .where("id", "in", pollIds)
      .execute();
    await transaction
      .insertInto("audit_logs")
      .values(
        pollIds.map((pollId) => ({
          id: randomUUID(),
          actor_user_id: null,
          action: "POLL_AUTO_CLOSED",
          entity_type: "POLL",
          entity_id: pollId,
          details: { reason: "AUTOMATIC" },
          created_at: now,
        })),
      )
      .execute();

    return { closedCount: pollIds.length, pollIds };
  });
}
