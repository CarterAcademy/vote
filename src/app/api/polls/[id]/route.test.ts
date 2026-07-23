import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/server/services/errors";

const mocks = vi.hoisted(() => ({
  ensureDatabaseReady: vi.fn(),
  getMemberPollDetail: vi.fn(),
  getPollDetail: vi.fn(),
  requireSessionUser: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/server/db", () => ({
  ensureDatabaseReady: mocks.ensureDatabaseReady,
}));

vi.mock("@/server/services", () => ({
  getMemberPollDetail: mocks.getMemberPollDetail,
  getPollDetail: mocks.getPollDetail,
}));

import { GET } from "./route";

describe("GET /api/polls/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000299",
      dingtalkUserId: "dt_poll_hr_01",
      name: "投票发起人",
      role: "HR",
    });
  });

  it("returns a non-disclosing not-found error without querying the service for a malformed ID", async () => {
    const response = await GET(
      new Request("http://localhost/api/polls/not-a-poll-id"),
      { params: Promise.resolve({ id: "not-a-poll-id" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND", message: "投票不存在" },
    });
    expect(mocks.getPollDetail).not.toHaveBeenCalled();
    expect(mocks.getMemberPollDetail).not.toHaveBeenCalled();
  });

  it("does not reveal whether a member-ineligible poll exists", async () => {
    mocks.requireSessionUser.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000298",
      dingtalkUserId: "dt_poll_member_01",
      name: "普通委员",
      role: "MEMBER",
      isCommitteeMember: true,
    });
    mocks.getMemberPollDetail.mockRejectedValue(
      new DomainError("NOT_ELIGIBLE", "您不在本次投票的委员名单中"),
    );

    const pollId = "00000000-0000-4000-8000-000000000399";
    const response = await GET(
      new Request(`http://localhost/api/polls/${pollId}?view=member`),
      { params: Promise.resolve({ id: pollId }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND", message: "投票不存在" },
    });
    expect(mocks.getMemberPollDetail).toHaveBeenCalledWith(
      pollId,
      expect.objectContaining({ role: "MEMBER" }),
    );
  });

  it("returns the same not-found envelope for an unknown poll", async () => {
    mocks.getPollDetail.mockRejectedValue(
      new DomainError("NOT_FOUND", "投票不存在"),
    );

    const pollId = "00000000-0000-4000-8000-000000000397";
    const response = await GET(
      new Request(`http://localhost/api/polls/${pollId}`),
      { params: Promise.resolve({ id: pollId }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND", message: "投票不存在" },
    });
  });
});
