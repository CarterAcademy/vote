import type {
  AdminPollDetail,
  ApiEnvelope,
  Committee,
  CommitteeMember,
  DirectoryPage,
  Initiator,
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

interface ApiRequestOptions extends RequestInit {
  dedupe?: boolean;
  memoryCacheMs?: number;
}

const inFlightGets = new Map<string, Promise<unknown>>();
const memoryCache = new Map<string, { expiresAt: number; value: unknown }>();

function invalidateMemoryCache(prefix: string) {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }
}

async function apiRequest<T>(url: string, init?: ApiRequestOptions): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const dedupeKey =
    method === "GET" && (init?.dedupe || init?.memoryCacheMs) ? url : null;
  const cached = dedupeKey ? memoryCache.get(dedupeKey) : undefined;
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  if (cached && dedupeKey) memoryCache.delete(dedupeKey);

  const existing = dedupeKey ? inFlightGets.get(dedupeKey) : undefined;
  if (existing) return existing as Promise<T>;

  const request = performRequest<T>(url, init);
  if (!dedupeKey) return request;

  inFlightGets.set(dedupeKey, request);
  try {
    const value = await request;
    if (init?.memoryCacheMs) {
      memoryCache.set(dedupeKey, {
        expiresAt: Date.now() + init.memoryCacheMs,
        value,
      });
    }
    return value;
  } finally {
    inFlightGets.delete(dedupeKey);
  }
}

async function performRequest<T>(url: string, init?: ApiRequestOptions): Promise<T> {
  const { dedupe, memoryCacheMs, ...requestInit } = init ?? {};
  void dedupe;
  void memoryCacheMs;
  const headers = new Headers(requestInit.headers);
  if (requestInit.body && !(requestInit.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...requestInit,
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

  dingtalkWebComplete: (authCode: string, state: string) =>
    apiRequest<SessionPayload>("/api/auth/dingtalk/web/complete", {
      method: "POST",
      body: JSON.stringify({ authCode, state }),
    }),

  logout: () => apiRequest<{ success: boolean }>("/api/logout", { method: "POST" }),

  committees: () =>
    apiRequest<{ items: Committee[] }>("/api/committees", {
      dedupe: true,
      memoryCacheMs: 60_000,
    }).then((result) => result.items),

  committeeMembers: (committeeId: string) =>
    apiRequest<{ items: CommitteeMember[] }>(`/api/committees/${committeeId}/members`).then(
      (result) => result.items,
    ),

  dingtalkDirectory: (departmentId: string, cursor = 0) => {
    const params = new URLSearchParams({ departmentId, cursor: String(cursor) });
    return apiRequest<DirectoryPage>(`/api/dingtalk/directory?${params.toString()}`);
  },

  searchDingtalkDirectory: (query: string, cursor = 0) => {
    const params = new URLSearchParams({ query, cursor: String(cursor) });
    return apiRequest<DirectoryPage>(`/api/dingtalk/directory?${params.toString()}`);
  },

  addCommitteeMember: async (
    committeeId: string,
    input: { dingtalkUserId: string; name: string; department?: string | null; position?: string | null },
  ) => {
    const result = await apiRequest<{ member: CommitteeMember }>(`/api/committees/${committeeId}/members`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    invalidateMemoryCache("/api/committees");
    return result;
  },

  removeCommitteeMember: async (committeeId: string, memberId: string) => {
    const result = await apiRequest<{ success: boolean }>(`/api/committees/${committeeId}/members/${memberId}`, {
      method: "DELETE",
    });
    invalidateMemoryCache("/api/committees");
    return result;
  },

  polls: (query?: {
    q?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
    status?: "OPEN" | "CLOSED";
    committeeId?: string;
    scope?: "OWN" | "ALL" | "ELIGIBLE";
  }) => {
    const params = new URLSearchParams();
    if (query?.q) params.set("q", query.q);
    if (query?.from) params.set("from", query.from);
    if (query?.to) params.set("to", query.to);
    if (query?.page) params.set("page", String(query.page));
    if (query?.pageSize) params.set("pageSize", String(query.pageSize));
    if (query?.status) params.set("status", query.status);
    if (query?.committeeId) params.set("committeeId", query.committeeId);
    if (query?.scope) params.set("scope", query.scope);
    const suffix = params.size ? `?${params.toString()}` : "";
    return apiRequest<PollListResponse>(`/api/polls${suffix}`);
  },

  createPoll: (input: {
    title: string;
    candidateName: string;
    committeeId: string;
    deadlineAt: string;
  }, files: File[] = []) => {
    const body = new FormData();
    body.set("title", input.title);
    body.set("candidateName", input.candidateName);
    body.set("committeeId", input.committeeId);
    body.set("deadlineAt", input.deadlineAt);
    for (const file of files) body.append("files", file);
    return apiRequest<{ poll: PollSummary }>("/api/polls", {
      method: "POST",
      body,
    });
  },

  initiators: () =>
    apiRequest<{ items: Initiator[] }>("/api/initiators").then((result) => result.items),

  addInitiator: (input: { dingtalkUserId: string; name: string; department?: string | null }) =>
    apiRequest<{ initiator: Initiator }>("/api/initiators", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  setInitiatorActive: (initiatorId: string, isActive: boolean) =>
    apiRequest<{ initiator: Initiator }>(`/api/initiators/${initiatorId}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    }),

  adminPoll: (pollId: string) => apiRequest<AdminPollDetail>(`/api/polls/${pollId}`),

  memberPoll: (pollId: string) => apiRequest<MemberPollDetail>(`/api/polls/${pollId}?view=member`),

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
