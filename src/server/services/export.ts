import { Workbook } from "exceljs";

import type { SessionUser } from "@/types";

import { ensureDatabaseReady } from "../db";
import { assertHr, toIso, writeAuditLog } from "./common";
import { DomainError } from "./errors";
import { getPollDetail } from "./polls";

const CHOICE_LABELS = {
  APPROVE: "通过",
  REJECT: "不通过",
  ABSTAIN: "弃权",
} as const;

function safeFilenamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 80);
}

export interface PollExport {
  fileName: string;
  contentType: string;
  buffer: ArrayBuffer;
}

export async function exportPollToExcel(
  pollId: string,
  actor: SessionUser,
): Promise<PollExport> {
  assertHr(actor);
  const detail = await getPollDetail(pollId, actor);
  if (!("stats" in detail)) {
    throw new DomainError("FORBIDDEN", "仅 HR 可以导出投票明细");
  }

  const db = await ensureDatabaseReady();
  const revisions = await db
    .selectFrom("vote_revisions")
    .innerJoin("poll_voters", "poll_voters.id", "vote_revisions.poll_voter_id")
    .select([
      "poll_voters.voter_name",
      "vote_revisions.revision_number",
      "vote_revisions.choice",
      "vote_revisions.opinion",
      "vote_revisions.changed_at",
    ])
    .where("vote_revisions.poll_id", "=", pollId)
    .orderBy("poll_voters.display_order", "asc")
    .orderBy("vote_revisions.revision_number", "asc")
    .execute();

  const workbook = new Workbook();
  workbook.creator = "两委会人选评审投票系统";
  workbook.created = new Date();
  workbook.modified = new Date();

  const summary = workbook.addWorksheet("投票汇总", {
    properties: { defaultRowHeight: 22 },
  });
  summary.columns = [
    { header: "项目", key: "label", width: 24 },
    { header: "内容", key: "value", width: 48 },
  ];
  summary.addRows([
    { label: "投票标题", value: detail.poll.title },
    { label: "评审人选", value: detail.poll.candidateName },
    { label: "委员会", value: detail.poll.committeeName },
    { label: "状态", value: detail.poll.status === "OPEN" ? "进行中" : "已关闭" },
    { label: "开始时间", value: detail.poll.startsAt },
    { label: "截止时间", value: detail.poll.deadlineAt },
    { label: "应投人数", value: detail.stats.totalVoters },
    { label: "已投人数", value: detail.stats.submittedCount },
    { label: "未投人数", value: detail.stats.missingCount },
    { label: "参与率", value: `${detail.stats.turnoutPercentage}%` },
    ...detail.stats.choices.map((choice) => ({
      label: CHOICE_LABELS[choice.choice],
      value: `${choice.count} 票（${choice.percentage}%）`,
    })),
  ]);

  const detailSheet = workbook.addWorksheet("投票明细", {
    properties: { defaultRowHeight: 22 },
    views: [{ state: "frozen", ySplit: 1 }],
  });
  detailSheet.columns = [
    { header: "序号", key: "index", width: 8 },
    { header: "委员", key: "name", width: 14 },
    { header: "部门", key: "department", width: 22 },
    { header: "职务", key: "position", width: 16 },
    { header: "状态", key: "status", width: 12 },
    { header: "投票选择", key: "choice", width: 12 },
    { header: "评审意见", key: "opinion", width: 50 },
    { header: "当前版本", key: "version", width: 12 },
    { header: "首次提交时间", key: "submittedAt", width: 24 },
    { header: "最后修改时间", key: "updatedAt", width: 24 },
  ];
  detailSheet.addRows(
    detail.voters.map((voter, index) => ({
      index: index + 1,
      name: voter.name,
      department: voter.department ?? "",
      position: voter.position ?? "",
      status: voter.hasVoted ? "已提交" : "未提交",
      choice: voter.choice ? CHOICE_LABELS[voter.choice] : "",
      opinion: voter.opinion ?? "",
      version: voter.version ?? "",
      submittedAt: voter.submittedAt ?? "",
      updatedAt: voter.updatedAt ?? "",
    })),
  );
  detailSheet.getColumn("opinion").alignment = { wrapText: true, vertical: "top" };
  detailSheet.autoFilter = { from: "A1", to: "J1" };

  const revisionsSheet = workbook.addWorksheet("修改记录", {
    properties: { defaultRowHeight: 22 },
    views: [{ state: "frozen", ySplit: 1 }],
  });
  revisionsSheet.columns = [
    { header: "委员", key: "name", width: 14 },
    { header: "版本", key: "version", width: 10 },
    { header: "投票选择", key: "choice", width: 12 },
    { header: "评审意见", key: "opinion", width: 50 },
    { header: "提交/修改时间", key: "changedAt", width: 24 },
  ];
  revisionsSheet.addRows(
    revisions.map((revision) => ({
      name: revision.voter_name,
      version: revision.revision_number,
      choice: CHOICE_LABELS[revision.choice],
      opinion: revision.opinion ?? "",
      changedAt: toIso(revision.changed_at),
    })),
  );
  revisionsSheet.getColumn("opinion").alignment = {
    wrapText: true,
    vertical: "top",
  };

  for (const worksheet of workbook.worksheets) {
    const header = worksheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F6CBD" },
    };
    header.alignment = { vertical: "middle" };
    header.height = 26;
  }

  await writeAuditLog(db, {
    actorUserId: actor.id,
    action: "POLL_EXPORTED",
    entityType: "POLL",
    entityId: pollId,
    details: { format: "xlsx" },
  });

  const bytes = await workbook.xlsx.writeBuffer();
  const rawBytes: unknown = bytes;
  const sourceBytes =
    rawBytes instanceof ArrayBuffer
      ? new Uint8Array(rawBytes)
      : ArrayBuffer.isView(rawBytes)
        ? new Uint8Array(
            rawBytes.buffer,
            rawBytes.byteOffset,
            rawBytes.byteLength,
          )
        : (() => {
            throw new Error("ExcelJS returned an unsupported buffer type");
          })();
  const arrayBuffer = new ArrayBuffer(sourceBytes.byteLength);
  new Uint8Array(arrayBuffer).set(sourceBytes);
  const date = new Date().toISOString().slice(0, 10);
  return {
    fileName: `${safeFilenamePart(detail.poll.candidateName)}-${safeFilenamePart(detail.poll.title)}-${date}.xlsx`,
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: arrayBuffer,
  };
}
