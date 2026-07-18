export type Role = "HR" | "MEMBER";
export type PollStatus = "OPEN" | "CLOSED";
export type VoteChoice = "APPROVE" | "REJECT" | "ABSTAIN";

export interface SessionUser {
  id: string;
  dingtalkUserId: string;
  name: string;
  role: Role;
}

export interface ChoiceStat {
  choice: VoteChoice;
  count: number;
  percentage: number;
}
