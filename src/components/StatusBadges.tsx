"use client";

import { Badge } from "@fluentui/react-components";
import type { PollStatus, VoteChoice } from "@/lib/client/types";
import { choiceLabel, isPast } from "@/lib/client/format";
import styles from "./StatusBadges.module.css";

export function PollStatusBadge({ status, deadlineAt }: { status: PollStatus; deadlineAt?: string }) {
  if (status === "CLOSED") return <span className={`${styles.status} ${styles.closed}`}>已关闭</span>;
  if (isPast(deadlineAt)) return <span className={`${styles.status} ${styles.expired}`}>已截止</span>;
  return <span className={`${styles.status} ${styles.open}`}>进行中</span>;
}

export function ChoiceBadge({ choice }: { choice?: VoteChoice | null }) {
  if (!choice) return <Badge appearance="outline">未投票</Badge>;
  if (choice === "APPROVE") return <Badge appearance="tint" color="success">{choiceLabel(choice)}</Badge>;
  if (choice === "REJECT") return <Badge appearance="tint" color="danger">{choiceLabel(choice)}</Badge>;
  return <Badge appearance="tint" color="warning">{choiceLabel(choice)}</Badge>;
}
