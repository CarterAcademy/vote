import type { SessionUser } from "@/types";

import { ensureDatabaseReady } from "../db";
import { DomainError } from "./errors";
import { toIso } from "./common";

export interface VoiceRecordingDto {
  id: string;
  transcript: string;
  contentType: string;
  sizeBytes: number;
  submitted: boolean;
  createdAt: string;
}

export interface VoiceRecordingFile extends VoiceRecordingDto {
  storedName: string;
}

function mapRecording(row: {
  id: string;
  transcript: string;
  content_type: string;
  size_bytes: number;
  status: "DRAFT" | "SUBMITTED";
  created_at: Date;
}): VoiceRecordingDto {
  return {
    id: row.id,
    transcript: row.transcript,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    submitted: row.status === "SUBMITTED",
    createdAt: toIso(row.created_at),
  };
}

export async function getEligiblePollVoter(pollId: string, actor: SessionUser) {
  const db = await ensureDatabaseReady();
  const row = await db
    .selectFrom("poll_voters")
    .innerJoin("polls", "polls.id", "poll_voters.poll_id")
    .select(["poll_voters.id", "polls.status", "polls.deadline_at"])
    .where("poll_voters.poll_id", "=", pollId)
    .where("poll_voters.user_id", "=", actor.id)
    .executeTakeFirst();
  if (!row) throw new DomainError("NOT_ELIGIBLE", "您不在本次投票的委员名单中");
  if (row.status !== "OPEN" || new Date(row.deadline_at) <= new Date()) {
    throw new DomainError("POLL_CLOSED", "本次投票已关闭，不能再上传录音");
  }
  return row.id;
}

export async function prepareVoiceRecordingSlot(
  pollId: string,
  pollVoterId: string,
  actor: SessionUser,
): Promise<string[]> {
  const db = await ensureDatabaseReady();
  return db.transaction().execute(async (transaction) => {
    const expiresBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const expired = await transaction
      .selectFrom("vote_voice_recordings")
      .select(["id", "stored_name"])
      .where("poll_id", "=", pollId)
      .where("poll_voter_id", "=", pollVoterId)
      .where("created_by_user_id", "=", actor.id)
      .where("status", "=", "DRAFT")
      .where("created_at", "<", expiresBefore)
      .forUpdate()
      .execute();
    if (expired.length > 0) {
      await transaction.deleteFrom("vote_voice_recordings")
        .where("id", "in", expired.map((row) => row.id))
        .execute();
    }
    const remaining = await transaction
      .selectFrom("vote_voice_recordings")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("poll_id", "=", pollId)
      .where("poll_voter_id", "=", pollVoterId)
      .where("created_by_user_id", "=", actor.id)
      .where("status", "=", "DRAFT")
      .executeTakeFirstOrThrow();
    if (Number(remaining.count) >= 10) {
      throw new DomainError("VALIDATION_ERROR", "待提交录音已达 10 段，请移除不需要的录音后重试");
    }
    return expired.map((row) => row.stored_name);
  });
}

export async function listActiveVoiceRecordings(pollId: string): Promise<Map<string, VoiceRecordingDto[]>> {
  const db = await ensureDatabaseReady();
  const rows = await db
    .selectFrom("vote_voice_recordings")
    .select(["id", "poll_voter_id", "transcript", "content_type", "size_bytes", "status", "created_at"])
    .where("poll_id", "=", pollId)
    .where("status", "=", "SUBMITTED")
    .where("is_active", "=", true)
    .orderBy("created_at", "asc")
    .execute();
  const byVoter = new Map<string, VoiceRecordingDto[]>();
  for (const row of rows) {
    const items = byVoter.get(row.poll_voter_id) ?? [];
    items.push(mapRecording(row));
    byVoter.set(row.poll_voter_id, items);
  }
  return byVoter;
}

export async function getVoiceRecordingForPlayback(
  pollId: string,
  recordingId: string,
  actor: SessionUser,
): Promise<VoiceRecordingFile> {
  const db = await ensureDatabaseReady();
  let query = db
    .selectFrom("vote_voice_recordings")
    .select(["id", "created_by_user_id", "stored_name", "transcript", "content_type", "size_bytes", "status", "is_active", "created_at"])
    .where("poll_id", "=", pollId)
    .where("id", "=", recordingId);
  if (actor.role === "HR") {
    query = query.where("status", "=", "SUBMITTED").where("is_active", "=", true);
  } else {
    query = query.where("created_by_user_id", "=", actor.id);
  }
  const row = await query.executeTakeFirst();
  if (!row) throw new DomainError("NOT_FOUND", "录音不存在或无权访问");
  return { ...mapRecording(row), storedName: row.stored_name };
}

export async function deleteDraftVoiceRecording(
  pollId: string,
  recordingId: string,
  actor: SessionUser,
): Promise<{ storedName: string }> {
  const db = await ensureDatabaseReady();
  return db.transaction().execute(async (transaction) => {
    const row = await transaction
      .selectFrom("vote_voice_recordings")
      .select(["stored_name"])
      .where("id", "=", recordingId)
      .where("poll_id", "=", pollId)
      .where("created_by_user_id", "=", actor.id)
      .where("status", "=", "DRAFT")
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw new DomainError("NOT_FOUND", "待提交录音不存在或不能删除");
    await transaction.deleteFrom("vote_voice_recordings").where("id", "=", recordingId).execute();
    return { storedName: row.stored_name };
  });
}
