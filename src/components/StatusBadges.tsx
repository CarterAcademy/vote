"use client";

import { Badge } from "@fluentui/react-components";
import type { PollStatus, VoteChoice } from "@/lib/client/types";
import { choiceLabel, isPast } from "@/lib/client/format";

export function PollStatusBadge({ status, deadlineAt }: { status: PollStatus; deadlineAt?: string }) {
  if (status === "CLOSED") return <Badge appearance="tint" color="informative">已关闭</Badge>;
  if (isPast(deadlineAt)) return <Badge appearance="tint" color="warning">已截止</Badge>;
  return <Badge appearance="tint" color="success">进行中</Badge>;
}

export function ChoiceBadge({ choice }: { choice?: VoteChoice | null }) {
  if (!choice) return <Badge appearance="outline">未投票</Badge>;
  if (choice === "APPROVE") return <Badge appearance="tint" color="success">{choiceLabel(choice)}</Badge>;
  if (choice === "REJECT") return <Badge appearance="tint" color="danger">{choiceLabel(choice)}</Badge>;
  return <Badge appearance="tint" color="warning">{choiceLabel(choice)}</Badge>;
}

