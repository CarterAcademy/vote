import { strict as assert } from "node:assert";

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3001";
const maintenanceSecret =
  process.env.E2E_MAINTENANCE_SECRET ?? "local-maintenance-secret-for-testing";

interface ApiResponse<T> {
  response: Response;
  body: T;
}

class ApiClient {
  private cookie = "";

  async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set("cookie", this.cookie);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      redirect: "manual",
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";", 1)[0];
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await response.json()
      : ((await response.arrayBuffer()) as T);
    return { response, body: body as T };
  }

  async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const result = await this.request<{ data?: T; error?: unknown }>(path, init);
    assert.equal(
      result.response.ok,
      true,
      `${init.method ?? "GET"} ${path} failed: ${JSON.stringify(result.body)}`,
    );
    assert.ok(result.body.data, `${path} did not return a data envelope`);
    return result.body.data;
  }
}

async function main() {
  const anonymous = new ApiClient();
  const session = await anonymous.json<{
    mockMode: boolean;
    demoUsers: Array<{ id: string; role: string; name: string }>;
  }>("/api/session");
  assert.equal(session.mockMode, true);
  assert.equal(session.demoUsers.length, 20);

  const hrUser = session.demoUsers.find((user) => user.role === "HR");
  const memberUser = session.demoUsers.find(
    (user) => user.id === "20000000-0000-4000-8000-000000000004",
  );
  assert.ok(hrUser);
  assert.ok(memberUser);

  const hr = new ApiClient();
  await hr.json("/api/demo/login", {
    method: "POST",
    body: JSON.stringify({ userId: hrUser.id }),
  });
  const committees = await hr.json<{
    items: Array<{ id: string; code: string; memberCount: number }>;
  }>("/api/committees");
  const academic = committees.items.find((item) => item.code === "ACADEMIC");
  assert.equal(academic?.memberCount, 10);
  assert.ok(academic);

  const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const created = await hr.json<{ poll: { id: string; candidateName: string } }>(
    "/api/polls",
    {
      method: "POST",
      body: JSON.stringify({
        title: "端到端测试评审",
        candidateName: "测试人选",
        committeeId: academic.id,
        deadlineAt: deadline,
      }),
    },
  );
  const pollId = created.poll.id;
  assert.equal(created.poll.candidateName, "测试人选");

  const member = new ApiClient();
  await member.json("/api/demo/login", {
    method: "POST",
    body: JSON.stringify({ userId: memberUser.id }),
  });
  const memberList = await member.json<{
    items: Array<Record<string, unknown>>;
  }>("/api/polls?pageSize=100");
  const memberSummary = memberList.items.find((poll) => poll.id === pollId);
  assert.ok(memberSummary);
  assert.equal("submittedCount" in memberSummary, false);
  assert.equal("totalVoters" in memberSummary, false);

  const memberDetail = await member.json<Record<string, unknown>>(
    `/api/polls/${pollId}`,
  );
  assert.equal("stats" in memberDetail, false);
  assert.equal("voters" in memberDetail, false);

  const invalidVote = await member.request<{ error: { code: string } }>(
    `/api/polls/${pollId}/vote`,
    {
      method: "POST",
      body: JSON.stringify({ choice: "APPROVE", opinion: null }),
    },
  );
  assert.equal(invalidVote.response.status, 400);
  assert.equal(invalidVote.body.error.code, "VALIDATION_ERROR");

  const firstVote = await member.json<{ vote: { version: number } }>(
    `/api/polls/${pollId}/vote`,
    {
      method: "POST",
      body: JSON.stringify({
        choice: "APPROVE",
        opinion: "材料完整，同意通过。",
      }),
    },
  );
  assert.equal(firstVote.vote.version, 1);

  const revisedVote = await member.json<{
    vote: { version: number; choice: string };
  }>(`/api/polls/${pollId}/vote`, {
    method: "POST",
    body: JSON.stringify({
      choice: "REJECT",
      opinion: "复核后认为支撑材料仍需补充。",
    }),
  });
  assert.equal(revisedVote.vote.version, 2);
  assert.equal(revisedVote.vote.choice, "REJECT");

  const hrDetail = await hr.json<{
    stats: { submittedCount: number; totalVoters: number };
    voters: Array<{ userId: string; version: number | null; choice: string | null }>;
    auditLogs: Array<{ action: string }>;
  }>(`/api/polls/${pollId}`);
  assert.equal(hrDetail.stats.totalVoters, 10);
  assert.equal(hrDetail.stats.submittedCount, 1);
  const namedVote = hrDetail.voters.find((voter) => voter.userId === memberUser.id);
  assert.equal(namedVote?.version, 2);
  assert.equal(namedVote?.choice, "REJECT");
  assert.ok(hrDetail.auditLogs.some((log) => log.action === "VOTE_UPDATED"));

  const exported = await hr.request<ArrayBuffer>(`/api/polls/${pollId}/export`);
  assert.equal(exported.response.status, 200);
  assert.match(
    exported.response.headers.get("content-type") ?? "",
    /spreadsheetml\.sheet/,
  );
  const exportBytes = new Uint8Array(exported.body);
  assert.equal(String.fromCharCode(exportBytes[0], exportBytes[1]), "PK");

  const reminded = await hr.json<{ requested: number; sent: number; failed: number }>(
    `/api/polls/${pollId}/remind`,
    { method: "POST" },
  );
  assert.equal(reminded.requested, 9);
  assert.equal(reminded.sent, 9);
  assert.equal(reminded.failed, 0);
  const duplicateReminder = await hr.request<{ error: { code: string } }>(
    `/api/polls/${pollId}/remind`,
    { method: "POST" },
  );
  assert.equal(duplicateReminder.response.status, 409);
  assert.equal(duplicateReminder.body.error.code, "CONFLICT");

  const closed = await hr.json<{ poll: { status: string; closeReason: string } }>(
    `/api/polls/${pollId}/close`,
    { method: "POST" },
  );
  assert.equal(closed.poll.status, "CLOSED");
  assert.equal(closed.poll.closeReason, "MANUAL");
  const voteAfterClose = await member.request<{ error: { code: string } }>(
    `/api/polls/${pollId}/vote`,
    {
      method: "POST",
      body: JSON.stringify({ choice: "ABSTAIN", opinion: null }),
    },
  );
  assert.equal(voteAfterClose.response.status, 409);
  assert.equal(voteAfterClose.body.error.code, "POLL_CLOSED");

  const expiring = await hr.json<{ poll: { id: string } }>("/api/polls", {
    method: "POST",
    body: JSON.stringify({
      title: "自动关票测试",
      candidateName: "到期人选",
      committeeId: academic.id,
      deadlineAt: new Date(Date.now() + 1500).toISOString(),
    }),
  });

  const maintenanceDenied = await anonymous.request<{ error: { code: string } }>(
    "/api/internal/maintenance/close-expired",
    { method: "POST" },
  );
  assert.equal(maintenanceDenied.response.status, 401);

  await new Promise((resolve) => setTimeout(resolve, 1800));
  const maintenance = await anonymous.json<{
    closedCount: number;
    pollIds: string[];
  }>("/api/internal/maintenance/close-expired", {
    method: "POST",
    headers: { "x-maintenance-secret": maintenanceSecret },
  });
  assert.ok(maintenance.closedCount >= 1);
  assert.ok(maintenance.pollIds.includes(expiring.poll.id));

  const autoClosed = await hr.json<{ poll: { status: string; closeReason: string } }>(
    `/api/polls/${expiring.poll.id}`,
  );
  assert.equal(autoClosed.poll.status, "CLOSED");
  assert.equal(autoClosed.poll.closeReason, "AUTOMATIC");

  console.log(
    JSON.stringify(
      {
        success: true,
        checks: [
          "mock-session",
          "hr-create",
          "member-result-isolation",
          "conditional-opinion",
          "vote-revision",
          "hr-named-detail",
          "excel-export",
          "reminder-cooldown",
          "manual-close",
          "automatic-close",
          "maintenance-auth",
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
