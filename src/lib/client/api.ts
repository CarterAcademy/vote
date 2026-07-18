import type {
  AdminPollDetail,
  ApiEnvelope,
  Committee,
  MemberPollDetail,
  PollSummary,
  PollListResponse,
  ReminderResponse,
  SessionPayload,
  VoteChoice,
  VoteRecord,
} from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "无法连接服务，请检查网络后重试");
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? "请求未完成，请稍后重试",
      error?.details,
    );
  }

  return (body as ApiEnvelope<T>).data;
}

export const api = {
  session: () => apiRequest<SessionPayload>("/api/session"),

  demoLogin: (userId: string) =>
    apiRequest<SessionPayload>("/api/demo/login", {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),

  dingtalkLogin: (authCode: string) =>
    apiRequest<SessionPayload>("/api/auth/dingtalk", {
      method: "POST",
      body: JSON.stringify({ authCode }),
    }),

  logout: () => apiRequest<{ success: boolean }>("/api/logout", { method: "POST" }),

  committees: () =>
    apiRequest<{ items: Committee[] }>("/api/committees").then((result) => result.items),

  polls: (query?: {
    q?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
    status?: "OPEN" | "CLOSED";
    committeeId?: string;
  }) => {
    const params = new URLSearchParams();
    if (query?.q) params.set("q", query.q);
    if (query?.from) params.set("from", query.from);
    if (query?.to) params.set("to", query.to);
    if (query?.page) params.set("page", String(query.page));
    if (query?.pageSize) params.set("pageSize", String(query.pageSize));
    if (query?.status) params.set("status", query.status);
    if (query?.committeeId) params.set("committeeId", query.committeeId);
    const suffix = params.size ? `?${params.toString()}` : "";
    return apiRequest<PollListResponse>(`/api/polls${suffix}`);
  },

  createPoll: (input: {
    title: string;
    candidateName: string;
    committeeId: string;
    deadlineAt: string;
  }) =>
    apiRequest<{ poll: PollSummary }>("/api/polls", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  adminPoll: (pollId: string) => apiRequest<AdminPollDetail>(`/api/polls/${pollId}`),

  memberPoll: (pollId: string) => apiRequest<MemberPollDetail>(`/api/polls/${pollId}`),

  vote: (pollId: string, choice: VoteChoice, opinion: string) =>
    apiRequest<{ vote: VoteRecord }>(`/api/polls/${pollId}/vote`, {
      method: "POST",
      body: JSON.stringify({ choice, opinion: opinion.trim() || null }),
    }),

  closePoll: (pollId: string) =>
    apiRequest<{ poll: { id: string; status: string; closedAt: string } }>(
      `/api/polls/${pollId}/close`,
      { method: "POST" },
    ),

  remind: (pollId: string) =>
    apiRequest<ReminderResponse>(`/api/polls/${pollId}/remind`, { method: "POST" }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "发生未知错误，请重试";
}
