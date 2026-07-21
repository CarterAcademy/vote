"use client";

import {
  Button,
  MessageBar,
  MessageBarBody,
  Tab,
  TabList,
} from "@fluentui/react-components";
import {
  CheckmarkCircleRegular,
  ClockRegular,
  LockClosedRegular,
} from "@fluentui/react-icons";
import { useCallback, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { formatCompactDate, isPast } from "@/lib/client/format";
import type { PollSummary } from "@/lib/client/types";
import { AppShell } from "@/components/AppShell";
import { EmptyState, ErrorState, PageLoading } from "@/components/PageState";
import { PollStatusBadge } from "@/components/StatusBadges";
import { PollAttachmentLinks } from "@/components/PollAttachmentLinks";
import styles from "./MemberPollList.module.css";

type Filter = "pending" | "all";

export function MemberPollList({ initialPolls }: { initialPolls: PollSummary[] }) {
  const [polls, setPolls] = useState<PollSummary[]>(initialPolls);
  const [filter, setFilter] = useState<Filter>("pending");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.polls({ pageSize: 100, scope: "ELIGIBLE" });
      setPolls(result.items);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  const pendingCount = useMemo(
    () => polls.filter((poll) => !poll.hasVoted && poll.status === "OPEN" && !isPast(poll.deadlineAt)).length,
    [polls],
  );

  const visiblePolls = useMemo(() => {
    if (filter === "all") return polls;
    return polls.filter((poll) => !poll.hasVoted && poll.status === "OPEN" && !isPast(poll.deadlineAt));
  }, [filter, polls]);

  return (
    <AppShell area="member">
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div>
            <h1>我的评审投票</h1>
            <p>提交前请核对人选和评审意见。投票结果仅 HR 可见。</p>
          </div>
        </header>

        {!loading && !error && polls.length > 0 && (
          <TabList
            className={styles.summary}
            selectedValue={filter}
            onTabSelect={(_, data) => setFilter(data.value as Filter)}
            aria-label="投票列表筛选"
          >
            <Tab value="pending">待投票 {pendingCount}</Tab>
            <Tab value="all">全部 {polls.length}</Tab>
          </TabList>
        )}

        {loading && <PageLoading label="正在加载投票任务" />}
        {error && <ErrorState description={error} onRetry={() => void load()} />}

        {!loading && !error && polls.length === 0 && (
          <EmptyState title="暂无投票任务" description="HR 发起投票后，任务会显示在这里。" />
        )}

        {!loading && !error && polls.length > 0 && visiblePolls.length === 0 && (
          <EmptyState
            title="待办已完成"
            description="当前没有需要提交的投票，可以在“全部”中查看自己的历史记录。"
            action={<Button onClick={() => setFilter("all")}>查看全部</Button>}
          />
        )}

        {!loading && !error && visiblePolls.length > 0 && (
          <div className={styles.list}>
            {visiblePolls.map((poll) => {
              const editable = poll.status === "OPEN" && !isPast(poll.deadlineAt);
              return (
                <article className={styles.poll} key={poll.id}>
                  <div className={styles.pollMain}>
                    <div className={styles.pollTop}>
                      <h2 className={styles.pollTitle}>{poll.title}</h2>
                      <PollStatusBadge status={poll.status} deadlineAt={poll.deadlineAt} />
                    </div>
                    <p className={styles.candidate}>评审人选：<strong>{poll.candidateName}</strong></p>
                    {poll.attachments.length > 0 && (
                      <div className={styles.attachments}>
                        <span>评审材料</span>
                        <PollAttachmentLinks pollId={poll.id} attachments={poll.attachments} />
                      </div>
                    )}
                    <div className={styles.meta}>
                      <span>{poll.committeeName}</span>
                      <span className={styles.metaItem}>
                        <ClockRegular aria-hidden="true" /> 截止 {formatCompactDate(poll.deadlineAt)}
                      </span>
                    </div>
                  </div>
                  <div className={styles.action}>
                    {poll.hasVoted && (
                      <span className={styles.submitted}><CheckmarkCircleRegular /> 已提交</span>
                    )}
                    <Button
                      as="a"
                      href={`/vote/${poll.id}`}
                      appearance={!poll.hasVoted && editable ? "primary" : "secondary"}
                    >
                      {!poll.hasVoted && editable ? "立即投票" : poll.hasVoted && editable ? "查看并修改" : "查看我的投票"}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <MessageBar className={styles.privacy} intent="info" icon={<LockClosedRegular />}>
          <MessageBarBody>本系统采用记名投票。只有 HR 可查看统计和明细，委员之间不可互相查看。</MessageBarBody>
        </MessageBar>
      </div>
    </AppShell>
  );
}
