import type { PollStatus, Role, VoteChoice } from "@/types";

export type { PollStatus, Role, VoteChoice };

export interface SessionUser {
  id: string;
  dingtalkUserId: string;
  name: string;
  role: Role;
}

export interface DemoUser extends SessionUser {
  committeeName?: string | null;
  department?: string | null;
}

export interface SessionPayload {
  user: SessionUser | null;
  mockMode?: boolean;
  demoUsers?: DemoUser[];
  corpId?: string | null;
}

export interface Committee {
  id: string;
  code: string;
  name: string;
  memberCount: number;
}

export interface PollSummary {
  id: string;
  title: string;
  candidateName: string;
  committeeName: string;
  status: PollStatus;
  deadlineAt: string;
  createdAt: string;
  submittedCount?: number;
  totalVoters?: number;
  hasVoted?: boolean;
  updatedAt?: string | null;
}

export interface PollListResponse {
  items: PollSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Poll {
  id: string;
  title: string;
  candidateName: string;
  committeeName: string;
  committeeId?: string;
  status: PollStatus;
  deadlineAt: string;
  createdAt?: string;
  createdByName?: string;
  closedAt?: string | null;
  closeReason?: string | null;
}

export interface VoteRecord {
  id?: string;
  pollId?: string;
  choice: VoteChoice;
  opinion: string | null;
  version: number;
  submittedAt: string;
  updatedAt: string;
}

export interface ChoiceStat {
  choice: VoteChoice;
  count: number;
  percentage: number;
}

export interface PollStats {
  totalVoters: number;
  submittedCount: number;
  missingCount: number;
  turnoutPercentage: number;
  choices: ChoiceStat[];
}

export interface PollVoter {
  id: string;
  userId: string;
  name: string;
  department?: string | null;
  hasVoted: boolean;
  choice?: VoteChoice | null;
  opinion?: string | null;
  submittedAt?: string | null;
  updatedAt?: string | null;
  version?: number;
}

export interface AuditLog {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: string;
  details?: Record<string, unknown> | string | null;
}

export interface AdminPollDetail {
  poll: Poll;
  stats: PollStats;
  voters: PollVoter[];
  auditLogs?: AuditLog[];
}

export interface MemberPollDetail {
  poll: Poll;
  myVote: VoteRecord | null;
  canEdit?: boolean;
}

export interface ReminderResult {
  pollVoterId: string;
  name: string;
  status: "SENT" | "FAILED" | string;
  error?: string;
}

export interface ReminderResponse {
  requested: number;
  sent: number;
  failed: number;
  results: ReminderResult[];
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiEnvelope<T> {
  data: T;
}
