import type { ColumnType, Generated } from "kysely";

export type UserRole = "HR" | "MEMBER";
export type CommitteeCode = string;
export type PollStatus = "OPEN" | "CLOSED";
export type PollCloseReason = "MANUAL" | "AUTOMATIC";
export type VoteChoice = "APPROVE" | "REJECT" | "ABSTAIN";
export type ReminderStatus = "PENDING" | "SENT" | "FAILED";
export type PollNotificationType =
  | "MANUAL"
  | "POLL_LAUNCHED"
  | "DEADLINE_24H"
  | "DEADLINE_3H";
export type VoiceRecordingStatus = "DRAFT" | "SUBMITTED";

type Timestamp = ColumnType<Date, Date | string, Date | string>;
type GeneratedTimestamp = ColumnType<
  Date,
  Date | string | undefined,
  Date | string
>;
type NullableTimestamp = ColumnType<
  Date | null,
  Date | string | null,
  Date | string | null
>;

export interface UserTable {
  id: string;
  dingtalk_user_id: string;
  name: string;
  department: string | null;
  role: UserRole;
  is_active: Generated<boolean>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface CommitteeTable {
  id: string;
  code: CommitteeCode;
  name: string;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface CommitteeMemberTable {
  id: string;
  committee_id: string;
  user_id: string;
  position: string | null;
  display_order: number;
  is_active: Generated<boolean>;
  joined_at: GeneratedTimestamp;
}

export interface PollTable {
  id: string;
  committee_id: string | null;
  title: string;
  candidate_name: string;
  status: PollStatus;
  starts_at: Timestamp;
  deadline_at: Timestamp;
  closed_at: NullableTimestamp;
  closed_by_user_id: string | null;
  close_reason: PollCloseReason | null;
  created_by_user_id: string;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface PollAttachmentTable {
  id: string;
  poll_id: string;
  original_name: string;
  stored_name: string;
  content_type: string;
  size_bytes: number;
  preview_text: string | null;
  display_order: number;
  created_at: GeneratedTimestamp;
}

export interface PollVoterTable {
  id: string;
  poll_id: string;
  user_id: string;
  dingtalk_user_id: string;
  voter_name: string;
  department: string | null;
  position: string | null;
  display_order: number;
  created_at: GeneratedTimestamp;
}

export interface VoteTable {
  id: string;
  poll_id: string;
  poll_voter_id: string;
  choice: VoteChoice;
  opinion: string | null;
  version: number;
  submitted_at: Timestamp;
  updated_at: Timestamp;
}

export interface VoteRevisionTable {
  id: string;
  vote_id: string;
  poll_id: string;
  poll_voter_id: string;
  revision_number: number;
  choice: VoteChoice;
  opinion: string | null;
  changed_by_user_id: string;
  changed_at: Timestamp;
}

export interface VoteVoiceRecordingTable {
  id: string;
  poll_id: string;
  poll_voter_id: string;
  vote_id: string | null;
  created_by_user_id: string;
  stored_name: string;
  content_type: string;
  size_bytes: number;
  transcript: string;
  status: VoiceRecordingStatus;
  is_active: Generated<boolean>;
  submitted_version: number | null;
  created_at: GeneratedTimestamp;
}

export interface ReminderLogTable {
  id: string;
  poll_id: string;
  poll_voter_id: string;
  triggered_by_user_id: string | null;
  notification_type: PollNotificationType;
  scheduled_for: Timestamp;
  delivery_status: ReminderStatus;
  request_id: string | null;
  error_message: string | null;
  sent_at: NullableTimestamp;
  created_at: GeneratedTimestamp;
}

export interface AuditLogTable {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  details: ColumnType<
    Record<string, unknown>,
    Record<string, unknown> | string,
    Record<string, unknown> | string
  >;
  created_at: GeneratedTimestamp;
}

export interface DatabaseSchema {
  users: UserTable;
  committees: CommitteeTable;
  committee_members: CommitteeMemberTable;
  polls: PollTable;
  poll_attachments: PollAttachmentTable;
  poll_voters: PollVoterTable;
  votes: VoteTable;
  vote_revisions: VoteRevisionTable;
  vote_voice_recordings: VoteVoiceRecordingTable;
  reminder_logs: ReminderLogTable;
  audit_logs: AuditLogTable;
}
