"use client";

import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  ProgressBar,
  Tab,
  TabList,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowDownloadRegular,
  ArrowLeftRegular,
  ArrowSyncRegular,
  CheckmarkCircleRegular,
  ClockRegular,
  DataBarVerticalRegular,
  HistoryRegular,
  LockClosedRegular,
  MailAlertRegular,
  PeopleRegular,
} from "@fluentui/react-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { choiceLabel, formatDateTime, isPast, percent } from "@/lib/client/format";
import type { AdminPollDetail as Detail, AuditLog, ChoiceStat, VoteChoice } from "@/lib/client/types";
import { AppShell } from "@/components/AppShell";
import { ErrorState, PageLoading } from "@/components/PageState";
import { ChoiceBadge, PollStatusBadge } from "@/components/StatusBadges";
import styles from "./AdminPollDetail.module.css";

type DetailTab = "overview" | "votes" | "audit";
type Notice = { intent: "success" | "error" | "warning" | "info"; title?: string; message: string };

const actionLabels: Record<string, string> = {
  POLL_CREATED: "发起投票",
  POLL_CLOSED: "关闭投票",
  POLL_AUTO_CLOSED: "到期自动关闭",
  VOTE_CAST: "提交投票",
  VOTE_UPDATED: "修改投票",
  REMINDER_SENT: "发送催投提醒",
  REMINDERS_SENT: "发送催投提醒",
  POLL_EXPORTED: "导出投票记录",
  CREATE_POLL: "发起投票",
  CLOSE_POLL: "关闭投票",
  CAST_VOTE: "提交投票",
  UPDATE_VOTE: "修改投票",
  REMIND_VOTERS: "发送催投提醒",
  EXPORT_POLL: "导出投票记录",
};

function findChoice(stats: ChoiceStat[], choice: VoteChoice): ChoiceStat {
  return stats.find((item) => item.choice === choice) ?? { choice, count: 0, percentage: 0 };
}

function auditLabel(log: AuditLog): string {
  return actionLabels[log.action] ?? log.action.replaceAll("_", " ");
}

function auditDetails(details: AuditLog["details"]): string | null {
  if (!details) return null;
  if (typeof details === "string") return details;
  const parts = Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .slice(0, 5)
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
  return parts.length ? parts.join("，") : null;
}

export function AdminPollDetail({
  pollId,
  initialDetail,
}: {
  pollId: string;
  initialDetail: Detail;
}) {
  const [detail, setDetail] = useState<Detail | null>(initialDetail);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [reminding, setReminding] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    if (!silent) setError(null);
    try {
      const next = await api.adminPoll(pollId);
      setDetail(next);
      setLastUpdated(new Date());
      if (silent) setError(null);
    } catch (requestError) {
      const message = errorMessage(requestError);
      if (silent) {
        setNotice({ intent: "warning", message: `自动刷新失败：${message}` });
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [pollId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const missingVoters = useMemo(
    () => detail?.voters.filter((voter) => !voter.hasVoted) ?? [],
    [detail],
  );
  const submittedVoters = useMemo(
    () => detail?.voters.filter((voter) => voter.hasVoted) ?? [],
    [detail],
  );

  async function remindMissing() {
    setReminding(true);
    setNotice(null);
    try {
      const result = await api.remind(pollId);
      setNotice({
        intent: result.failed ? "warning" : "success",
        title: "催投完成",
        message: `已请求 ${result.requested} 人，成功 ${result.sent} 人，失败 ${result.failed} 人。`,
      });
      await load(true);
    } catch (requestError) {
      setNotice({ intent: "error", title: "催投失败", message: errorMessage(requestError) });
    } finally {
      setReminding(false);
    }
  }

  async function closePoll() {
    setClosing(true);
    setNotice(null);
    try {
      await api.closePoll(pollId);
      setCloseDialog(false);
      setNotice({ intent: "success", title: "投票已关闭", message: "委员不能再提交或修改投票，当前统计已固定。" });
      await load(true);
    } catch (requestError) {
      setNotice({ intent: "error", title: "关闭失败", message: errorMessage(requestError) });
    } finally {
      setClosing(false);
    }
  }

  const isOpen = detail?.poll.status === "OPEN";
  const canRemind = Boolean(isOpen && detail && !isPast(detail.poll.deadlineAt) && missingVoters.length > 0);

  return (
    <AppShell area="admin">
      <div className={styles.page}>
        <Button as="a" href="/admin" appearance="subtle" icon={<ArrowLeftRegular />} className={styles.back}>
          返回投票管理
        </Button>

        {loading && <PageLoading label="正在加载投票统计" />}
        {!loading && error && !detail && <ErrorState description={error} onRetry={() => void load()} />}

        {!loading && detail && (
          <>
            <header className={styles.header}>
              <div>
                <p className={styles.candidate}>评审人选：{detail.poll.candidateName}</p>
                <div className={styles.titleRow}>
                  <h1>{detail.poll.title}</h1>
                  <PollStatusBadge status={detail.poll.status} deadlineAt={detail.poll.deadlineAt} />
                </div>
                <div className={styles.meta}>
                  <span>{detail.poll.committeeName}</span>
                  <span className={styles.metaItem}><ClockRegular /> 截止 {formatDateTime(detail.poll.deadlineAt)}</span>
                  {detail.poll.createdAt && <span>发起 {formatDateTime(detail.poll.createdAt)}</span>}
                </div>
              </div>
              <div className={styles.actions}>
                <Tooltip content={canRemind ? "钉钉私聊所有未投票委员" : "没有可催投的委员"} relationship="label">
                  <Button
                    appearance="secondary"
                    icon={<MailAlertRegular />}
                    disabled={!canRemind || reminding}
                    onClick={() => void remindMissing()}
                  >
                    {reminding ? "正在催投" : `一键催投${missingVoters.length ? `（${missingVoters.length}）` : ""}`}
                  </Button>
                </Tooltip>
                <Button
                  as="a"
                  href={`/api/polls/${pollId}/export`}
                  appearance="secondary"
                  icon={<ArrowDownloadRegular />}
                  download
                >
                  导出 Excel
                </Button>
                <Button
                  appearance="secondary"
                  icon={<LockClosedRegular />}
                  disabled={!isOpen}
                  onClick={() => setCloseDialog(true)}
                >
                  手动关闭
                </Button>
              </div>
            </header>

            {notice && (
              <MessageBar intent={notice.intent} className={styles.notice}>
                <MessageBarBody>
                  {notice.title && <MessageBarTitle>{notice.title}</MessageBarTitle>}
                  {notice.message}
                </MessageBarBody>
              </MessageBar>
            )}

            <div className={styles.syncBar}>
              <span className={styles.syncStatus}>
                <ArrowSyncRegular aria-hidden="true" />
                {refreshing ? "正在刷新" : "每 10 秒自动刷新"}
                {lastUpdated && `，上次更新 ${lastUpdated.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}`}
              </span>
              <Button appearance="subtle" size="small" icon={<ArrowSyncRegular />} onClick={() => void load(true)} disabled={refreshing}>
                立即刷新
              </Button>
            </div>

            <TabList
              className={styles.tabs}
              selectedValue={tab}
              onTabSelect={(_, data) => setTab(data.value as DetailTab)}
              aria-label="投票详情视图"
            >
              <Tab value="overview" icon={<DataBarVerticalRegular />}>进度与统计</Tab>
              <Tab value="votes" icon={<PeopleRegular />}>记名明细 {submittedVoters.length}</Tab>
              <Tab value="audit" icon={<HistoryRegular />}>操作记录 {detail.auditLogs?.length ?? 0}</Tab>
            </TabList>

            {tab === "overview" && (
              <>
                <div className={styles.overviewGrid}>
                  <section className={styles.panel} aria-labelledby="distribution-title">
                    <div className={styles.panelHeader}>
                      <div>
                        <h2 id="distribution-title">投票分布</h2>
                        <p>仅做票数和占比统计，不自动判断评审结论。</p>
                      </div>
                    </div>
                    <Distribution stats={detail.stats.choices} />
                  </section>

                  <section className={`${styles.panel} ${styles.turnoutPanel}`} aria-labelledby="turnout-title">
                    <span className={styles.turnoutLabel} id="turnout-title">总体投票率</span>
                    <div className={styles.turnoutNumber}>
                      <strong>{percent(detail.stats.turnoutPercentage)}</strong>
                      <span>{detail.stats.submittedCount} / {detail.stats.totalVoters} 人</span>
                    </div>
                    <ProgressBar
                      value={detail.stats.totalVoters ? detail.stats.submittedCount / detail.stats.totalVoters : 0}
                      thickness="large"
                      aria-label={`总体投票率 ${percent(detail.stats.turnoutPercentage)}`}
                    />
                    <div className={styles.turnoutMeta}>
                      <span><strong>{detail.stats.submittedCount}</strong>已投票</span>
                      <span><strong>{detail.stats.missingCount}</strong>未投票</span>
                    </div>
                  </section>
                </div>

                <section className={`${styles.panel} ${styles.missingPanel}`} aria-labelledby="missing-title">
                  <div className={styles.panelHeader}>
                    <div>
                      <h2 id="missing-title">未投票委员</h2>
                      <p>催投消息通过钉钉私聊发送，不会公开其他委员的投票状态。</p>
                    </div>
                    {missingVoters.length > 0 && (
                      <Button
                        appearance="primary"
                        icon={<MailAlertRegular />}
                        disabled={!canRemind || reminding}
                        onClick={() => void remindMissing()}
                      >
                        {reminding ? "正在发送" : "一键催投"}
                      </Button>
                    )}
                  </div>
                  {missingVoters.length > 0 ? (
                    <div className={styles.missingList}>
                      {missingVoters.map((voter) => (
                        <div className={styles.missingPerson} key={voter.id}>
                          <span className={styles.personName}>{voter.name}</span>
                          <span className={styles.department}>{voter.department || "部门未记录"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.completeState}><CheckmarkCircleRegular /> 全部委员均已提交投票</div>
                  )}
                </section>
              </>
            )}

            {tab === "votes" && (
              <section className={`${styles.panel} ${styles.tablePanel}`} aria-labelledby="vote-detail-title">
                <div className={styles.panelHeader}>
                  <div>
                    <h2 id="vote-detail-title">记名投票明细</h2>
                    <p>以下内容仅 HR 可见。意见按委员最后一次提交展示，修改轨迹保存在操作记录中。</p>
                  </div>
                </div>
                {submittedVoters.length > 0 ? (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th scope="col">委员</th>
                          <th scope="col">部门</th>
                          <th scope="col">选择</th>
                          <th scope="col">详细评审意见</th>
                          <th scope="col">提交时间</th>
                        </tr>
                      </thead>
                      <tbody>
                        {submittedVoters.map((voter) => (
                          <tr key={voter.id}>
                            <td><strong>{voter.name}</strong></td>
                            <td className={styles.muted}>{voter.department || "未记录"}</td>
                            <td><ChoiceBadge choice={voter.choice} /></td>
                            <td className={styles.opinion}>{voter.opinion || "未填写"}</td>
                            <td className={styles.muted}>{formatDateTime(voter.updatedAt ?? voter.submittedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className={styles.emptyInline}>暂无委员提交投票。</div>
                )}
              </section>
            )}

            {tab === "audit" && (
              <section className={styles.panel} aria-labelledby="audit-title">
                <div className={styles.panelHeader}>
                  <div>
                    <h2 id="audit-title">操作与修改记录</h2>
                    <p>记录发起、投票修改、催投、关闭和导出等关键操作。</p>
                  </div>
                </div>
                {detail.auditLogs?.length ? (
                  <div className={styles.auditList}>
                    {detail.auditLogs.map((log) => {
                      const description = auditDetails(log.details);
                      return (
                        <article className={styles.auditItem} key={log.id}>
                          <div>
                            <div className={styles.auditTitle}>{auditLabel(log)}</div>
                            <div className={styles.auditMeta}>操作人：{log.actorName || "系统"}</div>
                            {description && <div className={styles.auditDetail}>{description}</div>}
                          </div>
                          <time className={styles.auditTime} dateTime={log.createdAt}>{formatDateTime(log.createdAt)}</time>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.emptyInline}>暂无操作记录。</div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      <Dialog open={closeDialog} onOpenChange={(_, data) => setCloseDialog(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>确认关闭投票</DialogTitle>
            <DialogContent>
              <p className={styles.dialogText}>
                即使仍有委员未投票，也会立即关闭本场投票。关闭后委员不能再提交或修改，操作不可撤销。
              </p>
            </DialogContent>
            <DialogActions className={styles.dialogActions}>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary" disabled={closing}>取消</Button>
              </DialogTrigger>
              <Button appearance="primary" icon={<LockClosedRegular />} disabled={closing} onClick={() => void closePoll()}>
                {closing ? "正在关闭" : "确认关闭"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </AppShell>
  );
}

function Distribution({ stats }: { stats: ChoiceStat[] }) {
  const approve = findChoice(stats, "APPROVE");
  const reject = findChoice(stats, "REJECT");
  const abstain = findChoice(stats, "ABSTAIN");
  const total = approve.count + reject.count + abstain.count;
  const items = [approve, reject, abstain];

  return (
    <div className={styles.distribution}>
      <div
        className={styles.distributionBar}
        role="img"
        aria-label={`通过 ${approve.count} 票，不通过 ${reject.count} 票，弃权 ${abstain.count} 票`}
      >
        {total > 0 && (
          <>
            <span className={styles.approveSegment} style={{ width: `${approve.percentage}%` }} />
            <span className={styles.rejectSegment} style={{ width: `${reject.percentage}%` }} />
            <span className={styles.abstainSegment} style={{ width: `${abstain.percentage}%` }} />
          </>
        )}
      </div>
      <div className={styles.choiceGrid}>
        {items.map((item) => (
          <div className={styles.choiceMetric} key={item.choice}>
            <span className={styles.choiceName}>{choiceLabel(item.choice)}</span>
            <strong className={styles.choiceCount}>{item.count}</strong>
            <span className={styles.choicePercent}>{percent(item.percentage)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
