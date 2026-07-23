import { describe, expect, it } from "vitest";
import type { AuditLog } from "@/lib/client/types";
import { auditDetails, auditLabel } from "./auditPresentation";

function log(action: string, details: AuditLog["details"]): AuditLog {
  return {
    id: "audit-id",
    action,
    actorName: "测试管理员",
    createdAt: "2026-07-22T08:00:00.000Z",
    details,
  };
}

describe("audit presentation", () => {
  it("localizes vote choices and omits internal voter identifiers", () => {
    const item = log("VOTE_UPDATED", {
      pollVoterId: "37fecddd-c80e-48cc-b71f-e07e5b92f588",
      voterName: "林委员",
      previousChoice: "APPROVE",
      choice: "ABSTAIN",
      version: 3,
      internalPayload: { shouldNotAppear: true },
    });

    expect(auditLabel(item)).toBe("修改投票");
    expect(auditDetails(item)).toBe("评审人：林委员；意见：通过 → 弃权；第 3 版");
    expect(auditDetails(item)).not.toContain("APPROVE");
    expect(auditDetails(item)).not.toContain("37fecddd");
  });

  it("presents notification delivery as a concise localized summary", () => {
    const item = log("POLL_LAUNCH_NOTIFICATIONS_SENT", {
      type: "POLL_LAUNCHED",
      requested: 4,
      sent: 3,
      failed: 1,
    });

    expect(auditLabel(item)).toBe("发送投票通知");
    expect(auditDetails(item)).toBe("通知 4 人，成功 3 人，失败 1 人");
  });

  it("does not expose unknown action codes or payloads", () => {
    const item = log("INTERNAL_EVENT_V2", {
      committeeId: "10000000-0000-4000-8000-000000000001",
      raw: { secret: "payload" },
    });

    expect(auditLabel(item)).toBe("其他系统操作");
    expect(auditDetails(item)).toBeNull();
  });
});
