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
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  ProgressBar,
  SearchBox,
  Select,
} from "@fluentui/react-components";
import {
  AddRegular,
  ArrowRightRegular,
  CalendarRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  DismissRegular,
} from "@fluentui/react-icons";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { formatCompactDate, isPast, localDateTimeInput, percent } from "@/lib/client/format";
import type { Committee, Initiator, PollDashboardStats, PollListResponse, PollSummary } from "@/lib/client/types";
import { AppShell } from "@/components/AppShell";
import { EmptyState, ErrorState, PageLoading } from "@/components/PageState";
import { PollStatusBadge } from "@/components/StatusBadges";
import { InitiatorManagement } from "./InitiatorManagement";
import styles from "./AdminOverview.module.css";

interface CreateForm {
  candidateName: string;
  title: string;
  committeeId: string;
  deadlineAt: string;
}

function defaultDeadline() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(18, 0, 0, 0);
  return localDateTimeInput(date);
}

const emptyForm: CreateForm = {
  candidateName: "",
  title: "",
  committeeId: "",
  deadlineAt: "",
};

export function AdminOverview({
  initialPolls,
  initialCommittees,
  scope = "OWN",
  initialInitiators,
  initialDashboardStats,
}: {
  initialPolls: PollListResponse;
  initialCommittees: Committee[];
  scope?: "OWN" | "ALL";
  initialInitiators?: Initiator[];
  initialDashboardStats?: PollDashboardStats;
}) {
  const router = useRouter();
  const [polls, setPolls] = useState<PollSummary[]>(initialPolls.items);
  const [committees, setCommittees] = useState<Committee[]>(initialCommittees);
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(initialPolls.total);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committeeError, setCommitteeError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>({ ...emptyForm, deadlineAt: defaultDeadline() });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const loadedOnce = useRef(true);
  const skipInitialPollLoad = useRef(true);
  const requestSequence = useRef(0);
  const pageSize = 20;
  const dateRangeInvalid = Boolean(fromDate && toDate && fromDate > toDate);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    if (dateRangeInvalid) {
      setSearching(false);
      return;
    }
    if (loadedOnce.current) setSearching(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await api.polls({
        q: query.trim() || undefined,
        from: fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined,
        to: toDate ? new Date(`${toDate}T23:59:59.999`).toISOString() : undefined,
        page,
        pageSize,
        scope,
      });
      if (requestId !== requestSequence.current) return;
      setPolls(result.items);
      setTotal(result.total);
      loadedOnce.current = true;
    } catch (requestError) {
      if (requestId !== requestSequence.current) return;
      setError(errorMessage(requestError));
    } finally {
      if (requestId !== requestSequence.current) return;
      setLoading(false);
      setSearching(false);
    }
  }, [dateRangeInvalid, fromDate, page, query, scope, toDate]);

  const loadCommittees = useCallback(async () => {
    setCommitteeError(null);
    try {
      const committeeItems = await api.committees();
      setCommittees(committeeItems);
      setForm((current) => ({
        ...current,
        committeeId: current.committeeId || committeeItems[0]?.id || "",
      }));
    } catch (requestError) {
      setCommitteeError(errorMessage(requestError));
    }
  }, []);

  useEffect(() => {
    if (skipInitialPollLoad.current) {
      skipInitialPollLoad.current = false;
      return;
    }
    const timeout = window.setTimeout(() => void load(), query ? 350 : 0);
    return () => window.clearTimeout(timeout);
  }, [load, query]);

  const pageStats = useMemo(() => {
    const active = polls.filter((poll) => poll.status === "OPEN" && !isPast(poll.deadlineAt));
    const submitted = polls.reduce((sum, poll) => sum + (poll.submittedCount ?? 0), 0);
    const eligible = polls.reduce((sum, poll) => sum + (poll.totalVoters ?? 0), 0);
    return {
      active: active.length,
      total,
      closed: polls.length - active.length,
      turnout: eligible ? Math.round((submitted / eligible) * 1000) / 10 : 0,
    };
  }, [polls, total]);
  const stats = initialDashboardStats ?? pageStats;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = Boolean(query.trim() || fromDate || toDate);
  const displayError = error ?? committeeError;

  const invalid = attempted && {
    candidateName: !form.candidateName.trim(),
    title: !form.title.trim(),
    committeeId: !form.committeeId,
    deadlineAt: !form.deadlineAt || new Date(form.deadlineAt).getTime() <= Date.now(),
  };

  function openCreateDialog() {
    setForm({
      ...emptyForm,
      committeeId: committees[0]?.id ?? "",
      deadlineAt: defaultDeadline(),
    });
    setAttempted(false);
    setFormError(null);
    setDialogOpen(true);
  }

  async function createPoll() {
    setAttempted(true);
    if (!form.candidateName.trim() || !form.title.trim() || !form.committeeId || !form.deadlineAt || new Date(form.deadlineAt).getTime() <= Date.now()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await api.createPoll({
        candidateName: form.candidateName.trim(),
        title: form.title.trim(),
        committeeId: form.committeeId,
        deadlineAt: new Date(form.deadlineAt).toISOString(),
      });
      setDialogOpen(false);
      router.push(`/admin/polls/${result.poll.id}`);
    } catch (requestError) {
      setFormError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell area="admin">
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div>
            <h1>{scope === "ALL" ? "系统管理" : "评审投票管理"}</h1>
            <p>{scope === "ALL" ? "维护发起人权限，查看全部投票与整体进度。" : "发起投票，掌握本人发起场次的进度，并长期追溯评审记录。"}</p>
          </div>
          <Button appearance="primary" icon={<AddRegular />} size="large" onClick={openCreateDialog} disabled={committees.length === 0}>
            发起投票
          </Button>
        </header>

        {loading && <PageLoading label="正在加载管理数据" />}
        {displayError && !dateRangeInvalid && (
          <ErrorState
            description={displayError}
            onRetry={() => { void load(); void loadCommittees(); }}
          />
        )}

        {!loading && !displayError && (
          <>
            {scope === "ALL" && initialInitiators && (
              <InitiatorManagement initialInitiators={initialInitiators} />
            )}
            <section className={styles.metrics} aria-label="投票概览">
              <div className={styles.metric}>
                <span className={styles.metricLabel}> 进行中</span>
                <span className={styles.metricValue}>{stats.active}</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>{scope === "ALL" ? "全部记录" : "我的记录"}</span>
                <span className={styles.metricValue}>{stats.total}</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}> 已结束</span>
                <span className={styles.metricValue}>{stats.closed}</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}> 总投票率</span>
                <span className={styles.metricValue}>{percent(stats.turnout)}</span>
              </div>
            </section>

            <section className={styles.section} id="history" aria-labelledby="poll-history-title">
              <div className={styles.sectionHeader}>
                <h2 id="poll-history-title">投票记录</h2>
              </div>
              <div className={styles.tools}>
                <SearchBox
                  className={styles.search}
                  value={query}
                  onChange={(_, data) => { setQuery(data.value); setPage(1); }}
                  placeholder="按标题或人选搜索"
                  aria-label="搜索投票记录"
                />
                <Field className={styles.filterField} label="起始日期">
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(_, data) => { setFromDate(data.value); setPage(1); }}
                    aria-label="记录起始日期"
                  />
                </Field>
                <Field
                  className={styles.filterField}
                  label="结束日期"
                  validationState={dateRangeInvalid ? "error" : "none"}
                  validationMessage={dateRangeInvalid ? "不能早于起始日期" : undefined}
                >
                  <Input
                    type="date"
                    value={toDate}
                    min={fromDate || undefined}
                    onChange={(_, data) => { setToDate(data.value); setPage(1); }}
                    aria-label="记录结束日期"
                  />
                </Field>
                {hasFilters && (
                  <Button
                    appearance="subtle"
                    icon={<DismissRegular />}
                    onClick={() => { setQuery(""); setFromDate(""); setToDate(""); setPage(1); }}
                  >
                    清除筛选
                  </Button>
                )}
              </div>

              {searching && <div className={styles.searching} role="status">正在更新检索结果</div>}

              {polls.length === 0 && !hasFilters ? (
                <EmptyState
                  title="还没有投票记录"
                  description="创建第一场人选评审投票，系统会自动带出委员会成员名单。"
                  action={<Button appearance="primary" icon={<AddRegular />} onClick={openCreateDialog}>发起投票</Button>}
                />
              ) : polls.length === 0 ? (
                <EmptyState
                  title="没有匹配记录"
                  description="请调整标题、人选或日期范围后重试。"
                  action={<Button onClick={() => { setQuery(""); setFromDate(""); setToDate(""); setPage(1); }}>清除筛选</Button>}
                />
              ) : (
                <>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th scope="col">投票</th>
                          <th scope="col">委员会</th>
                          {scope === "ALL" && <th scope="col">发起人</th>}
                          <th scope="col">状态</th>
                          <th scope="col">投票进度</th>
                          <th scope="col">截止时间</th>
                          <th scope="col"><span className="sr-only">操作</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {polls.map((poll) => {
                          const submitted = poll.submittedCount ?? 0;
                          const total = poll.totalVoters ?? 0;
                          const turnout = total ? submitted / total : 0;
                          return (
                            <tr key={poll.id}>
                              <td>
                                <a className={styles.pollLink} href={`/admin/polls/${poll.id}`}>
                                  <strong>{poll.title}</strong>
                                  <span>人选：{poll.candidateName}</span>
                                </a>
                              </td>
                              <td>{poll.committeeName}</td>
                              {scope === "ALL" && <td>{poll.createdByName}</td>}
                              <td><PollStatusBadge status={poll.status} deadlineAt={poll.deadlineAt} /></td>
                              <td>
                                <div className={styles.turnout}>
                                  <span className={styles.turnoutText}>{submitted} / {total}</span>
                                  <ProgressBar value={turnout} thickness="medium" aria-label={`投票进度 ${submitted}/${total}`} />
                                </div>
                              </td>
                              <td className={styles.deadline}>{formatCompactDate(poll.deadlineAt)}</td>
                              <td><Button as="a" href={`/admin/polls/${poll.id}`} appearance="subtle" icon={<ArrowRightRegular />} aria-label={`查看 ${poll.title}`} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className={styles.mobileList}>
                    {polls.map((poll) => {
                      const submitted = poll.submittedCount ?? 0;
                      const total = poll.totalVoters ?? 0;
                      return (
                        <article className={styles.mobilePoll} key={poll.id}>
                          <div className={styles.mobileTop}>
                            <a className={styles.pollLink} href={`/admin/polls/${poll.id}`}>
                              <strong>{poll.title}</strong>
                              <span>人选：{poll.candidateName}</span>
                            </a>
                            <PollStatusBadge status={poll.status} deadlineAt={poll.deadlineAt} />
                          </div>
                          <ProgressBar value={total ? submitted / total : 0} aria-label={`投票进度 ${submitted}/${total}`} />
                          <div className={styles.mobileMeta}>
                            <span>{poll.committeeName}</span>
                            {scope === "ALL" && <span>发起人：{poll.createdByName}</span>}
                            <span>{submitted} / {total} 已投</span>
                          </div>
                          <Button as="a" href={`/admin/polls/${poll.id}`} appearance="secondary">查看详情</Button>
                        </article>
                      );
                    })}
                  </div>

                  <nav className={styles.pagination} aria-label="投票记录分页">
                    <span>第 {page} / {totalPages} 页，共 {total} 条</span>
                    <div>
                      <Button
                        appearance="secondary"
                        icon={<ChevronLeftRegular />}
                        disabled={page <= 1 || searching}
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                      >
                        上一页
                      </Button>
                      <Button
                        appearance="secondary"
                        iconPosition="after"
                        icon={<ChevronRightRegular />}
                        disabled={page >= totalPages || searching}
                        onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      >
                        下一页
                      </Button>
                    </div>
                  </nav>
                </>
              )}
            </section>
          </>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(_, data) => setDialogOpen(data.open)}>
        <DialogSurface className={styles.createDialog}>
          <DialogBody>
            <DialogTitle>发起人选评审投票</DialogTitle>
            <DialogContent className={styles.createDialogContent}>
              <p className={styles.dialogIntro}>每场只评审一位人选。委员名单会按所选委员会自动固化。</p>
              {formError && (
                <MessageBar intent="error" style={{ marginBottom: 14 }}>
                  <MessageBarBody>{formError}</MessageBarBody>
                </MessageBar>
              )}
              <form id="create-poll-form" className={styles.dialogForm} onSubmit={(event) => { event.preventDefault(); void createPoll(); }}>
                <Field
                  label="人选姓名"
                  required
                  validationState={invalid && invalid.candidateName ? "error" : "none"}
                  validationMessage={invalid && invalid.candidateName ? "请输入人选姓名" : undefined}
                >
                  <Input
                    value={form.candidateName}
                    onChange={(_, data) => setForm((current) => ({ ...current, candidateName: data.value }))}
                    placeholder="例如：赵明远"
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label="投票标题"
                  required
                  hint="标题与人选姓名分别保存，便于后续检索。"
                  validationState={invalid && invalid.title ? "error" : "none"}
                  validationMessage={invalid && invalid.title ? "请输入投票标题" : undefined}
                >
                  <Input
                    value={form.title}
                    onChange={(_, data) => setForm((current) => ({ ...current, title: data.value }))}
                    placeholder="例如：2026 年度学术委员会人选评审"
                    maxLength={120}
                  />
                </Field>
                <Field
                  label="评审委员会"
                  required
                  validationState={invalid && invalid.committeeId ? "error" : "none"}
                  validationMessage={invalid && invalid.committeeId ? "请选择委员会" : undefined}
                >
                  <Select
                    value={form.committeeId}
                    onChange={(event) => setForm((current) => ({ ...current, committeeId: event.target.value }))}
                    aria-label="评审委员会"
                  >
                    <option value="" disabled>请选择委员会</option>
                    {committees.map((committee) => (
                      <option value={committee.id} key={committee.id}>{committee.name}（{committee.memberCount} 人）</option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="截止时间"
                  required
                  hint="到达截止时间后系统自动停止提交和修改。"
                  validationState={invalid && invalid.deadlineAt ? "error" : "none"}
                  validationMessage={invalid && invalid.deadlineAt ? "截止时间必须晚于当前时间" : undefined}
                >
                  <Input
                    type="datetime-local"
                    value={form.deadlineAt}
                    min={localDateTimeInput(new Date())}
                    onChange={(_, data) => setForm((current) => ({ ...current, deadlineAt: data.value }))}
                    contentBefore={<CalendarRegular />}
                  />
                </Field>
              </form>
            </DialogContent>
            <DialogActions className={styles.dialogActions}>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary" disabled={submitting}>取消</Button>
              </DialogTrigger>
              <Button type="submit" form="create-poll-form" appearance="primary" disabled={submitting}>
                {submitting ? "正在发起" : "确认发起"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </AppShell>
  );
}
