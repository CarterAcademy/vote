"use client";

import {
  Button,
  Checkbox,
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
  MessageBarTitle,
  ProgressBar,
  SearchBox,
  Select,
} from "@fluentui/react-components";
import {
  AddRegular,
  ArrowRightRegular,
  CalendarRegular,
  ChevronLeftRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  ChevronUpRegular,
  DismissRegular,
} from "@fluentui/react-icons";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { formatCompactDate, isPast, localDateTimeInput, percent } from "@/lib/client/format";
import type { Committee, CommitteeMember, Initiator, PollDashboardStats, PollListResponse, PollSummary } from "@/lib/client/types";
import { useSession } from "@/lib/client/session";
import { AppShell } from "@/components/AppShell";
import { EmptyState, ErrorState, PageLoading } from "@/components/PageState";
import { PollStatusBadge } from "@/components/StatusBadges";
import { PollAttachmentLinks } from "@/components/PollAttachmentLinks";
import { InitiatorManagement } from "./InitiatorManagement";
import { DirectoryPersonPicker, type DirectoryPerson } from "./DirectoryPersonPicker";
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
  const { mockMode = false, corpId } = useSession();
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
  const [directVoters, setDirectVoters] = useState<DirectoryPerson[]>([]);
  const [voterPickerOpen, setVoterPickerOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [committeeMembers, setCommitteeMembers] = useState<CommitteeMember[] | null>(null);
  const [selectedCommitteeMemberIds, setSelectedCommitteeMemberIds] = useState<string[] | null>([]);
  const [committeeMembersExpanded, setCommitteeMembersExpanded] = useState(true);
  const [recipientCountLoading, setRecipientCountLoading] = useState(false);
  const [recipientCountError, setRecipientCountError] = useState<string | null>(null);
  const [recipientCountRetry, setRecipientCountRetry] = useState(0);
  const loadedOnce = useRef(true);
  const skipInitialPollLoad = useRef(true);
  const requestSequence = useRef(0);
  const committeeMemberRequest = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const pageSize = 20;
  const dateRangeInvalid = Boolean(fromDate && toDate && fromDate > toDate);

  const notificationRecipientCount = useMemo(() => {
    if (form.committeeId && selectedCommitteeMemberIds === null) return null;
    return new Set([
      ...(selectedCommitteeMemberIds ?? []),
      ...directVoters.map((person) => person.dingtalkUserId),
    ]).size;
  }, [directVoters, form.committeeId, selectedCommitteeMemberIds]);

  useEffect(() => {
    const committeeId = form.committeeId;
    const requestId = ++committeeMemberRequest.current;
    setRecipientCountError(null);

    if (!committeeId) {
      setCommitteeMembers(null);
      setSelectedCommitteeMemberIds([]);
      setRecipientCountLoading(false);
      return;
    }

    setCommitteeMembers(null);
    setSelectedCommitteeMemberIds(null);
    setRecipientCountLoading(true);
    void api.committeeMembers(committeeId)
      .then((members) => {
        if (requestId !== committeeMemberRequest.current) return;
        setCommitteeMembers(members);
        setSelectedCommitteeMemberIds(members.map((member) => member.dingtalkUserId));
        setCommitteeMembersExpanded(true);
      })
      .catch((requestError) => {
        if (requestId !== committeeMemberRequest.current) return;
        setRecipientCountError(`无法核对通知人数：${errorMessage(requestError)}`);
      })
      .finally(() => {
        if (requestId === committeeMemberRequest.current) setRecipientCountLoading(false);
      });
  }, [form.committeeId, recipientCountRetry]);

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
    voters: notificationRecipientCount === 0,
    deadlineAt: !form.deadlineAt || new Date(form.deadlineAt).getTime() <= Date.now(),
  };

  function openCreateDialog() {
    setForm({
      ...emptyForm,
      deadlineAt: defaultDeadline(),
    });
    setAttempted(false);
    setFormError(null);
    setDirectVoters([]);
    setCommitteeMembers(null);
    setSelectedCommitteeMemberIds([]);
    setCommitteeMembersExpanded(true);
    setVoterPickerOpen(false);
    setFiles([]);
    setFileError(null);
    if (fileInput.current) fileInput.current.value = "";
    setDialogOpen(true);
  }

  function selectFiles(selected: File[]) {
    if (selected.length > 5) {
      setFileError("每场投票最多上传 5 个附件");
      return;
    }
    const unsupported = selected.find((file) => !/\.(pdf|docx?)$/i.test(file.name));
    if (unsupported) {
      setFileError(`${unsupported.name} 不是支持的 PDF、DOC 或 DOCX 文件`);
      return;
    }
    const oversized = selected.find((file) => file.size > 10 * 1024 * 1024);
    if (oversized) {
      setFileError(`${oversized.name} 超过 10 MB 大小限制`);
      return;
    }
    setFiles(selected);
    setFileError(null);
  }

  async function createPoll() {
    setAttempted(true);
    if (
      !form.candidateName.trim()
      || !form.title.trim()
      || notificationRecipientCount === null
      || notificationRecipientCount === 0
      || !form.deadlineAt
      || new Date(form.deadlineAt).getTime() <= Date.now()
    ) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await api.createPoll({
        candidateName: form.candidateName.trim(),
        title: form.title.trim(),
        committeeId: form.committeeId || undefined,
        committeeVoterIds: form.committeeId ? selectedCommitteeMemberIds ?? undefined : undefined,
        directVoters,
        deadlineAt: new Date(form.deadlineAt).toISOString(),
      }, files);
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
          <Button appearance="primary" icon={<AddRegular />} size="large" onClick={openCreateDialog}>
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
                <Field className={styles.filterField} label="截止日期起">
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(_, data) => { setFromDate(data.value); setPage(1); }}
                    aria-label="截止日期起始"
                  />
                </Field>
                <Field
                  className={styles.filterField}
                  label="截止日期止"
                  validationState={dateRangeInvalid ? "error" : "none"}
                  validationMessage={dateRangeInvalid ? "不能早于起始日期" : undefined}
                >
                  <Input
                    type="date"
                    value={toDate}
                    min={fromDate || undefined}
                    onChange={(_, data) => { setToDate(data.value); setPage(1); }}
                    aria-label="截止日期结束"
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
                  align="left"
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
                          <th className={styles.pollColumn} scope="col">投票</th>
                          <th className={styles.attachmentColumn} scope="col">附件</th>
                          <th className={styles.committeeColumn} scope="col">委员会</th>
                          {scope === "ALL" && <th className={styles.initiatorColumn} scope="col">发起人</th>}
                          <th className={styles.statusColumn} scope="col">状态</th>
                          <th className={styles.turnoutColumn} scope="col">投票进度</th>
                          <th className={styles.deadlineColumn} scope="col">截止时间</th>
                          <th className={styles.actionColumn} scope="col"><span className="sr-only">操作</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {polls.map((poll) => {
                          const submitted = poll.submittedCount ?? 0;
                          const total = poll.totalVoters ?? 0;
                          const turnout = total ? submitted / total : 0;
                          return (
                            <tr key={poll.id}>
                              <td className={styles.pollColumn}>
                                <a className={styles.pollLink} href={`/admin/polls/${poll.id}`}>
                                  <strong title={poll.title}>{poll.title}</strong>
                                  <span title={`人选：${poll.candidateName}`}>人选：{poll.candidateName}</span>
                                </a>
                              </td>
                              <td className={styles.attachmentColumn}><PollAttachmentLinks pollId={poll.id} attachments={poll.attachments} /></td>
                              <td className={styles.committeeColumn} title={poll.committeeName}>{poll.committeeName}</td>
                              {scope === "ALL" && <td className={styles.initiatorColumn} title={poll.createdByName}>{poll.createdByName}</td>}
                              <td className={styles.statusColumn}><PollStatusBadge status={poll.status} deadlineAt={poll.deadlineAt} /></td>
                              <td className={styles.turnoutColumn}>
                                <div className={styles.turnout}>
                                  <span className={styles.turnoutText}>{submitted} / {total}</span>
                                  <ProgressBar value={turnout} thickness="medium" aria-label={`投票进度 ${submitted}/${total}`} />
                                </div>
                              </td>
                              <td className={`${styles.deadlineColumn} ${styles.deadline}`}>{formatCompactDate(poll.deadlineAt)}</td>
                              <td className={styles.actionColumn}><Button as="a" href={`/admin/polls/${poll.id}`} appearance="subtle" icon={<ArrowRightRegular />} aria-label={`查看 ${poll.title}`} /></td>
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
                          <PollAttachmentLinks pollId={poll.id} attachments={poll.attachments} emptyLabel="无附件" />
                          <ProgressBar value={total ? submitted / total : 0} aria-label={`投票进度 ${submitted}/${total}`} />
                          <div className={styles.mobileMeta}>
                            <span>{poll.committeeName}</span>
                            {scope === "ALL" && <span>发起人：{poll.createdByName}</span>}
                            <span>{submitted} / {total} 已投</span>
                            <span>截止：{formatCompactDate(poll.deadlineAt)}</span>
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
              <p className={styles.dialogIntro}>每场只评审一位人选。可选择委员会、直接选择评审人，或组合使用；重复人员会自动合并。</p>
              {formError && (
                <MessageBar intent="error" style={{ marginBottom: 14 }}>
                  <MessageBarBody>{formError}</MessageBarBody>
                </MessageBar>
              )}
              <form id="create-poll-form" className={styles.dialogForm} noValidate onSubmit={(event) => { event.preventDefault(); void createPoll(); }}>
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
                    aria-invalid={invalid && invalid.candidateName ? true : undefined}
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
                    aria-invalid={invalid && invalid.title ? true : undefined}
                  />
                </Field>
                <Field
                  label="附件（可选）"
                  hint="最多 5 个文件；仅支持 PDF、DOC、DOCX，每个不超过 10 MB。"
                  validationState={fileError ? "error" : "none"}
                  validationMessage={fileError ?? undefined}
                >
                  <input
                    ref={fileInput}
                    className={styles.fileInput}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    disabled={submitting}
                    onChange={(event) => selectFiles(Array.from(event.currentTarget.files ?? []))}
                  />
                  {files.length > 0 && (
                    <ul className={styles.selectedFiles} aria-label="已选择附件">
                      {files.map((file, index) => (
                        <li key={`${file.name}-${file.lastModified}-${index}`}>
                          <span title={file.name}>{file.name}</span>
                          <button
                            type="button"
                            aria-label={`移除 ${file.name}`}
                            onClick={() => {
                              const next = files.filter((_, fileIndex) => fileIndex !== index);
                              setFiles(next);
                              setFileError(null);
                              if (fileInput.current) fileInput.current.value = "";
                            }}
                          >
                            <DismissRegular />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Field>
                <Field
                  label="评审委员会（可选）"
                  hint="选择后默认全员参评，可在下方快速排除本场不参评的成员。"
                  validationState={invalid && invalid.voters ? "error" : "none"}
                  validationMessage={invalid && invalid.voters ? "请至少选择一个委员会或一名评审人" : undefined}
                >
                  <Select
                    value={form.committeeId}
                    onChange={(event) => setForm((current) => ({ ...current, committeeId: event.target.value }))}
                    aria-label="评审委员会"
                    aria-invalid={invalid && invalid.voters ? true : undefined}
                  >
                    <option value="">不选择委员会</option>
                    {committees.map((committee) => (
                      <option value={committee.id} key={committee.id}>{committee.name}（{committee.memberCount} 人）</option>
                    ))}
                  </Select>
                </Field>
                {form.committeeId && (
                  <section className={styles.committeeMembers} aria-label="本场委员会参评成员">
                    <button
                      type="button"
                      className={styles.committeeMembersHeader}
                      aria-expanded={committeeMembersExpanded}
                      aria-controls="committee-member-options"
                      onClick={() => setCommitteeMembersExpanded((current) => !current)}
                    >
                      <span>
                        <strong>本场参评成员</strong>
                        <small>
                          {recipientCountLoading || selectedCommitteeMemberIds === null
                            ? "正在读取成员"
                            : `已选 ${selectedCommitteeMemberIds.length} / ${committeeMembers?.length ?? 0} 人`}
                        </small>
                      </span>
                      {committeeMembersExpanded ? <ChevronUpRegular /> : <ChevronDownRegular />}
                    </button>
                    {committeeMembersExpanded && (
                      <div id="committee-member-options" className={styles.committeeMembersBody}>
                        {recipientCountLoading || committeeMembers === null ? (
                          <div className={styles.committeeMembersLoading} role="status">正在加载委员会成员…</div>
                        ) : committeeMembers.length > 0 ? (
                          <>
                            <div className={styles.committeeMemberTools}>
                              <span>点击成员即可切换本场参评状态</span>
                              <span>
                                <Button
                                  type="button"
                                  appearance="subtle"
                                  size="small"
                                  disabled={selectedCommitteeMemberIds?.length === committeeMembers.length}
                                  onClick={() => setSelectedCommitteeMemberIds(committeeMembers.map((member) => member.dingtalkUserId))}
                                >
                                  全选
                                </Button>
                                <Button
                                  type="button"
                                  appearance="subtle"
                                  size="small"
                                  disabled={selectedCommitteeMemberIds?.length === 0}
                                  onClick={() => setSelectedCommitteeMemberIds([])}
                                >
                                  取消全选
                                </Button>
                              </span>
                            </div>
                            <div className={styles.committeeMemberGrid}>
                              {committeeMembers.map((member) => {
                                const checked = selectedCommitteeMemberIds?.includes(member.dingtalkUserId) ?? false;
                                return (
                                  <label
                                    className={`${styles.committeeMemberOption} ${checked ? styles.committeeMemberOptionSelected : ""}`}
                                    key={member.id}
                                  >
                                    <Checkbox
                                      checked={checked}
                                      aria-label={`${checked ? "取消选择" : "选择"}${member.name}`}
                                      onChange={(_, data) => setSelectedCommitteeMemberIds((current) => {
                                        const ids = current ?? [];
                                        return data.checked
                                          ? [...new Set([...ids, member.dingtalkUserId])]
                                          : ids.filter((id) => id !== member.dingtalkUserId);
                                      })}
                                    />
                                    <span>
                                      <strong>{member.name}</strong>
                                      <small>{member.position || member.department || "委员"}</small>
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </>
                        ) : (
                          <div className={styles.committeeMembersLoading}>该委员会暂无有效成员</div>
                        )}
                      </div>
                    )}
                  </section>
                )}
                <Field
                  label="直接选择评审人（可选）"
                  hint="可与委员会组合使用。若人员重复，最终名单只保留一人。"
                >
                  <div className={styles.voterControl}>
                    <Button
                      type="button"
                      appearance="secondary"
                      onClick={() => setVoterPickerOpen((current) => !current)}
                    >
                      {voterPickerOpen ? "收起通讯录" : `从通讯录选择${directVoters.length ? `（已选 ${directVoters.length} 人）` : ""}`}
                    </Button>
                    {directVoters.length > 0 && (
                      <ul className={styles.selectedVoters} aria-label="已直接选择的评审人">
                        {directVoters.map((person) => (
                          <li key={person.dingtalkUserId}>
                            <span><strong>{person.name}</strong><small>{person.department || person.title || "钉钉通讯录"}</small></span>
                            <button
                              type="button"
                              aria-label={`移除评审人${person.name}`}
                              onClick={() => setDirectVoters((current) => current.filter((item) => item.dingtalkUserId !== person.dingtalkUserId))}
                            >
                              <DismissRegular />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {voterPickerOpen && (
                      <div className={styles.voterPicker}>
                        <DirectoryPersonPicker
                          open={dialogOpen && voterPickerOpen}
                          mockMode={mockMode}
                          corpId={corpId}
                          excludedUserIds={directVoters.map((person) => person.dingtalkUserId)}
                          selected={null}
                          onSelect={(person) => setDirectVoters((current) =>
                            current.some((item) => item.dingtalkUserId === person.dingtalkUserId)
                              ? current
                              : [...current, person]
                          )}
                        />
                      </div>
                    )}
                  </div>
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
                    aria-invalid={invalid && invalid.deadlineAt ? true : undefined}
                  />
                </Field>
                {recipientCountError ? (
                  <MessageBar intent="error" className={styles.notificationNotice}>
                    <MessageBarBody>
                      <MessageBarTitle>无法确认通知名单</MessageBarTitle>
                      {recipientCountError}
                      <Button
                        type="button"
                        appearance="subtle"
                        size="small"
                        onClick={() => setRecipientCountRetry((current) => current + 1)}
                      >
                        重新核对
                      </Button>
                    </MessageBarBody>
                  </MessageBar>
                ) : (
                  <MessageBar intent="warning" className={styles.notificationNotice}>
                    <MessageBarBody>
                      <MessageBarTitle>发起后会立即发送钉钉通知</MessageBarTitle>
                      {recipientCountLoading || notificationRecipientCount === null
                        ? "正在核对去重后的评审人名单。"
                        : notificationRecipientCount > 0
                          ? `确认发起后，系统将立即通知去重后的 ${notificationRecipientCount} 名评审人；已发送的消息无法撤回。`
                          : "请选择评审委员会或直接添加评审人。确认发起后，系统会立即向评审人发送消息。"}
                    </MessageBarBody>
                  </MessageBar>
                )}
              </form>
            </DialogContent>
            <DialogActions className={styles.dialogActions}>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="secondary" disabled={submitting}>取消</Button>
              </DialogTrigger>
              <Button
                type="submit"
                form="create-poll-form"
                appearance="primary"
                disabled={submitting || recipientCountLoading || notificationRecipientCount === null || Boolean(recipientCountError)}
              >
                {submitting
                  ? "正在发起并发送通知"
                  : notificationRecipientCount && notificationRecipientCount > 0
                    ? `发起并通知 ${notificationRecipientCount} 人`
                    : "确认发起并发送通知"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </AppShell>
  );
}
