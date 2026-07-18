import { randomUUID } from "node:crypto";

import type { SessionUser } from "@/types";

import { ensureDatabaseReady, type VoteChoice } from "../db";
import { voteSchema, type VoteInput } from "../validation";
import { toIso, writeAuditLog } from "./common";
import { DomainError } from "./errors";

export interface VoteDto {
  id: string;
  pollId: string;
  choice: VoteChoice;
  opinion: string | null;
  version: number;
  submittedAt: string;
  updatedAt: string;
}

export async function castOrUpdateVote(
  pollId: string,
  input: VoteInput | unknown,
  actor: SessionUser,
): Promise<VoteDto> {
  const parsed = voteSchema.parse(input);
  const db = await ensureDatabaseReady();

  return db.transaction().execute(async (transaction) => {
    const now = new Date();
    const eligibility = await transaction
      .selectFrom("poll_voters")
      .innerJoin("polls", "polls.id", "poll_voters.poll_id")
      .select([
        "poll_voters.id as poll_voter_id",
        "poll_voters.voter_name",
        "polls.id as poll_id",
        "polls.status",
        "polls.deadline_at",
      ])
      .where("poll_voters.poll_id", "=", pollId)
      .where("poll_voters.user_id", "=", actor.id)
      .forUpdate()
      .executeTakeFirst();
    if (!eligibility) {
      const pollExists = await transaction
        .selectFrom("polls")
        .select("id")
        .where("id", "=", pollId)
        .executeTakeFirst();
      throw new DomainError(
        pollExists ? "NOT_ELIGIBLE" : "NOT_FOUND",
        pollExists ? "您不在本次投票的委员名单中" : "投票不存在",
      );
    }
    if (eligibility.status !== "OPEN") {
      throw new DomainError("POLL_CLOSED", "本次投票已关闭，不能再提交");
    }
    if (new Date(eligibility.deadline_at) <= now) {
      throw new DomainError("DEADLINE_PASSED", "本次投票已到截止时间");
    }

    const existing = await transaction
      .selectFrom("votes")
      .selectAll()
      .where("poll_id", "=", pollId)
      .where("poll_voter_id", "=", eligibility.poll_voter_id)
      .executeTakeFirst();

    if (!existing) {
      const voteId = randomUUID();
      await transaction
        .insertInto("votes")
        .values({
          id: voteId,
          poll_id: pollId,
          poll_voter_id: eligibility.poll_voter_id,
          choice: parsed.choice,
          opinion: parsed.opinion,
          version: 1,
          submitted_at: now,
          updated_at: now,
        })
        .execute();
      await transaction
        .insertInto("vote_revisions")
        .values({
          id: randomUUID(),
          vote_id: voteId,
          poll_id: pollId,
          poll_voter_id: eligibility.poll_voter_id,
          revision_number: 1,
          choice: parsed.choice,
          opinion: parsed.opinion,
          changed_by_user_id: actor.id,
          changed_at: now,
        })
        .execute();
      await writeAuditLog(transaction, {
        actorUserId: actor.id,
        action: "VOTE_CAST",
        entityType: "POLL",
        entityId: pollId,
        details: {
          pollVoterId: eligibility.poll_voter_id,
          voterName: eligibility.voter_name,
          choice: parsed.choice,
          version: 1,
        },
        createdAt: now,
      });

      return {
        id: voteId,
        pollId,
        choice: parsed.choice,
        opinion: parsed.opinion,
        version: 1,
        submittedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
    }

    const nextVersion = existing.version + 1;
    await transaction
      .updateTable("votes")
      .set({
        choice: parsed.choice,
        opinion: parsed.opinion,
        version: nextVersion,
        updated_at: now,
      })
      .where("id", "=", existing.id)
      .where("version", "=", existing.version)
      .executeTakeFirstOrThrow();
    await transaction
      .insertInto("vote_revisions")
      .values({
        id: randomUUID(),
        vote_id: existing.id,
        poll_id: pollId,
        poll_voter_id: eligibility.poll_voter_id,
        revision_number: nextVersion,
        choice: parsed.choice,
        opinion: parsed.opinion,
        changed_by_user_id: actor.id,
        changed_at: now,
      })
      .execute();
    await writeAuditLog(transaction, {
      actorUserId: actor.id,
      action: "VOTE_UPDATED",
      entityType: "POLL",
      entityId: pollId,
      details: {
        pollVoterId: eligibility.poll_voter_id,
        voterName: eligibility.voter_name,
        previousChoice: existing.choice,
        choice: parsed.choice,
        version: nextVersion,
      },
      createdAt: now,
    });

    return {
      id: existing.id,
      pollId,
      choice: parsed.choice,
      opinion: parsed.opinion,
      version: nextVersion,
      submittedAt: toIso(existing.submitted_at),
      updatedAt: now.toISOString(),
    };
  });
}
