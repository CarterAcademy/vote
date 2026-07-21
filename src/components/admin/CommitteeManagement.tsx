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
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  SearchBox,
  Spinner,
} from "@fluentui/react-components";
import {
  AddRegular,
  DeleteRegular,
  EditRegular,
  PeopleCommunityRegular,
  PersonAddRegular,
} from "@fluentui/react-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, ErrorState, PageLoading } from "@/components/PageState";
import { api, errorMessage } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import type {
  Committee,
  CommitteeMember,
  DirectoryDepartment,
  DirectoryUser as ApiDirectoryUser,
} from "@/lib/client/types";
import styles from "./CommitteeManagement.module.css";

interface DirectoryUser {
  dingtalkUserId: string;
  name: string;
  department: string | null;
  title?: string;
}

interface DirectoryLocation {
  id: string;
  name: string;
}

const directoryRoot: DirectoryLocation = { id: "1", name: "企业通讯录" };

const mockDirectory: DirectoryUser[] = [
  { dingtalkUserId: "dt_mock_directory_01", name: "郑博文", department: "前沿研究中心" },
  { dingtalkUserId: "dt_mock_directory_02", name: "沈嘉禾", department: "工程创新中心" },
  { dingtalkUserId: "dt_mock_directory_03", name: "蒋文博", department: "人工智能研究院" },
  { dingtalkUserId: "dt_mock_directory_04", name: "丁若楠", department: "科研管理部" },
  { dingtalkUserId: "dt_mock_directory_05", name: "谢承宇", department: "先进制造实验室" },
  { dingtalkUserId: "dt_mock_directory_06", name: "宋思远", department: "成果转化中心" },
  { dingtalkUserId: "dt_mock_directory_07", name: "韩雨薇", department: "数字技术中心" },
  { dingtalkUserId: "dt_mock_directory_08", name: "许正阳", department: "质量与标准部" },
];

function initials(name: string) {
  return name.trim().slice(-2);
}

export function CommitteeManagement({
  initialCommittees,
  initialMembersByCommittee,
}: {
  initialCommittees: Committee[];
  initialMembersByCommittee: Record<string, CommitteeMember[]>;
}) {
  const { mockMode, corpId } = useSession();
  const [committees, setCommittees] = useState<Committee[]>(initialCommittees);
  const [membersByCommittee, setMembersByCommittee] = useState<Record<string, CommitteeMember[]>>(initialMembersByCommittee);
  const [selectedId, setSelectedId] = useState(initialCommittees[0]?.id ?? "");
  const [memberPanelOpen, setMemberPanelOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<DirectoryUser[]>([]);
  const [position, setPosition] = useState("委员");
  const [saving, setSaving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<CommitteeMember | null>(null);
  const [groupDialogMode, setGroupDialogMode] = useState<"create" | "rename" | null>(null);
  const [renameGroupTarget, setRenameGroupTarget] = useState<Committee | null>(null);
  const [groupName, setGroupName] = useState("");
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<Committee | null>(null);
  const [isInDingTalk, setIsInDingTalk] = useState(false);
  const [directoryPath, setDirectoryPath] = useState<DirectoryLocation[]>([directoryRoot]);
  const [directoryDepartments, setDirectoryDepartments] = useState<DirectoryDepartment[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryHasMore, setDirectoryHasMore] = useState(false);
  const [directoryCursor, setDirectoryCursor] = useState<number | undefined>();
  const [directorySearchUsers, setDirectorySearchUsers] = useState<DirectoryUser[]>([]);
  const [directorySearchLoading, setDirectorySearchLoading] = useState(false);
  const [directorySearchHasMore, setDirectorySearchHasMore] = useState(false);
  const [directorySearchCursor, setDirectorySearchCursor] = useState<number | undefined>();
  const [dialogError, setDialogError] = useState<string | null>(null);
  const directorySearchRequest = useRef(0);

  useEffect(() => {
    if (mockMode) return;
    let active = true;
    void import("dingtalk-jsapi")
      .then((dd) => {
        if (active) setIsInDingTalk(dd.env.platform !== "notInDingTalk");
      })
      .catch(() => {
        if (active) setIsInDingTalk(false);
      });
    return () => { active = false; };
  }, [mockMode]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const committeeItems = await api.committees();
      const memberEntries = await Promise.all(
        committeeItems.map(async (committee) => [committee.id, await api.committeeMembers(committee.id)] as const),
      );
      setCommittees(committeeItems);
      setMembersByCommittee(Object.fromEntries(memberEntries));
      setSelectedId((current) => current || committeeItems[0]?.id || "");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  const selectedCommittee = committees.find((committee) => committee.id === selectedId);
  const members = useMemo(
    () => membersByCommittee[selectedId] ?? [],
    [membersByCommittee, selectedId],
  );
  const filteredMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return members;
    return members.filter((member) =>
      [member.name, member.department, member.position].some((value) =>
        value?.toLowerCase().includes(normalized),
      ),
    );
  }, [members, query]);
  const directoryExcludedMembers = useMemo(
    () => groupDialogMode === "create" ? [] : members,
    [groupDialogMode, members],
  );
  const availableMockUsers = useMemo(() => {
    const memberIds = new Set(directoryExcludedMembers.map((member) => member.dingtalkUserId));
    const normalized = directoryQuery.trim().toLowerCase();
    return mockDirectory.filter(
      (user) =>
        !memberIds.has(user.dingtalkUserId) &&
        (!normalized || `${user.name}${user.department}`.toLowerCase().includes(normalized)),
    );
  }, [directoryExcludedMembers, directoryQuery]);
  const visibleDirectoryUsers = useMemo(() => {
    const memberIds = new Set(directoryExcludedMembers.map((member) => member.dingtalkUserId));
    const source = directoryQuery.trim() ? directorySearchUsers : directoryUsers;
    return source.filter((user) => !memberIds.has(user.dingtalkUserId));
  }, [directoryExcludedMembers, directoryQuery, directorySearchUsers, directoryUsers]);

  const loadDirectory = useCallback(async (
    location: DirectoryLocation,
    cursor = 0,
    append = false,
  ) => {
    setDirectoryLoading(true);
    setDialogError(null);
    try {
      const page = await api.dingtalkDirectory(location.id, cursor);
      const users = page.users.map((user: ApiDirectoryUser) => ({
        dingtalkUserId: user.userId,
        name: user.name,
        department: location.name,
      }));
      setDirectoryDepartments(page.departments);
      setDirectoryUsers((current) => append ? [...current, ...users] : users);
      setDirectoryHasMore(page.hasMore);
      setDirectoryCursor(page.nextCursor);
    } catch (requestError) {
      setDialogError(errorMessage(requestError));
      if (!append) {
        setDirectoryDepartments([]);
        setDirectoryUsers([]);
      }
    } finally {
      setDirectoryLoading(false);
    }
  }, []);

  const searchDirectory = useCallback(async (
    searchQuery: string,
    cursor = 0,
    append = false,
  ) => {
    const requestId = ++directorySearchRequest.current;
    setDirectorySearchLoading(true);
    setDialogError(null);
    try {
      const page = await api.searchDingtalkDirectory(searchQuery, cursor);
      if (requestId !== directorySearchRequest.current) return;
      const users = page.users.map((user: ApiDirectoryUser) => ({
        dingtalkUserId: user.userId,
        name: user.name,
        department: user.department ?? null,
        ...(user.title ? { title: user.title } : {}),
      }));
      setDirectorySearchUsers((current) => append ? [...current, ...users] : users);
      setDirectorySearchHasMore(page.hasMore);
      setDirectorySearchCursor(page.nextCursor);
    } catch (requestError) {
      if (requestId !== directorySearchRequest.current) return;
      setDialogError(errorMessage(requestError));
      if (!append) setDirectorySearchUsers([]);
    } finally {
      if (requestId === directorySearchRequest.current) {
        setDirectorySearchLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (mockMode || (!addOpen && groupDialogMode !== "create")) return;
    const searchQuery = directoryQuery.trim();
    if (!searchQuery) {
      directorySearchRequest.current += 1;
      setDirectorySearchUsers([]);
      setDirectorySearchHasMore(false);
      setDirectorySearchCursor(undefined);
      setDirectorySearchLoading(false);
      return;
    }

    directorySearchRequest.current += 1;
    setDirectorySearchLoading(true);
    const timer = window.setTimeout(() => {
      void searchDirectory(searchQuery);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [addOpen, directoryQuery, groupDialogMode, mockMode, searchDirectory]);

  function resetDirectorySelection() {
    setSelectedUsers([]);
    setDirectoryQuery("");
    setPosition("委员");
    setDialogError(null);
    setDirectoryPath([directoryRoot]);
    setDirectoryDepartments([]);
    setDirectoryUsers([]);
    setDirectorySearchUsers([]);
    setDirectorySearchHasMore(false);
    setDirectorySearchCursor(undefined);
    if (!mockMode) void loadDirectory(directoryRoot);
  }

  function openAddDialog() {
    resetDirectorySelection();
    setNotice(null);
    setAddOpen(true);
  }

  function openCreateGroupDialog() {
    setGroupName("");
    setRenameGroupTarget(null);
    resetDirectorySelection();
    setGroupDialogMode("create");
  }

  function openMemberPanel(committee: Committee) {
    setSelectedId(committee.id);
    setQuery("");
    setNotice(null);
    setMemberPanelOpen(true);
  }

  function openRenameGroupDialog(committee: Committee) {
    setGroupName(committee.name);
    setRenameGroupTarget(committee);
    setDialogError(null);
    setGroupDialogMode("rename");
  }

  async function saveGroup() {
    const name = groupName.trim();
    if (!name || !groupDialogMode) return;
    setSaving(true);
    setDialogError(null);
    try {
      if (groupDialogMode === "create") {
        const result = await api.createCommittee(name, selectedUsers.map((user) => ({
          ...user,
          position: position.trim() || "委员",
        })));
        setCommittees((current) => [...current, result.committee]);
        setMembersByCommittee((current) => ({ ...current, [result.committee.id]: result.members }));
        setSelectedId(result.committee.id);
        setMemberPanelOpen(false);
        setNotice(`已创建小组“${result.committee.name}”`);
      } else if (renameGroupTarget) {
        const result = await api.renameCommittee(renameGroupTarget.id, name);
        setCommittees((current) => current.map((committee) =>
          committee.id === result.committee.id ? result.committee : committee,
        ));
        setNotice(`小组已重命名为“${result.committee.name}”`);
      }
      setGroupDialogMode(null);
      setRenameGroupTarget(null);
    } catch (requestError) {
      setDialogError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function deleteGroup() {
    if (!deleteGroupTarget) return;
    setSaving(true);
    setDialogError(null);
    try {
      await api.deleteCommittee(deleteGroupTarget.id);
      const remaining = committees.filter((committee) => committee.id !== deleteGroupTarget.id);
      setCommittees(remaining);
      setMembersByCommittee((current) => {
        const next = { ...current };
        delete next[deleteGroupTarget.id];
        return next;
      });
      if (selectedId === deleteGroupTarget.id) {
        setSelectedId(remaining[0]?.id ?? "");
        setMemberPanelOpen(false);
      }
      setNotice(`已删除小组“${deleteGroupTarget.name}”`);
      setDeleteGroupTarget(null);
    } catch (requestError) {
      setDialogError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  function toggleDirectoryUser(user: DirectoryUser, checked: boolean) {
    setSelectedUsers((current) =>
      checked
        ? current.length >= 30 || current.some((item) => item.dingtalkUserId === user.dingtalkUserId)
          ? current
          : [...current, user]
        : current.filter((item) => item.dingtalkUserId !== user.dingtalkUserId),
    );
  }

  function enterDepartment(department: DirectoryDepartment) {
    const location = { id: department.id, name: department.name };
    setDirectoryPath((current) => [...current, location]);
    setDirectoryQuery("");
    void loadDirectory(location);
  }

  function returnToDirectory(index: number) {
    const location = directoryPath[index];
    if (!location) return;
    setDirectoryPath((current) => current.slice(0, index + 1));
    setDirectoryQuery("");
    void loadDirectory(location);
  }

  async function chooseFromDingTalk() {
    setDialogError(null);
    try {
      if (!corpId) throw new Error("缺少钉钉企业 ID，请联系管理员检查配置");
      const dd = await import("dingtalk-jsapi");
      if (dd.env.platform === "notInDingTalk") throw new Error("当前浏览器无法使用钉钉客户端选择器");
      const raw = await dd.biz.contact.choose({
        corpId,
        multiple: true,
        max: 30,
        users: directoryExcludedMembers.map((member) => member.dingtalkUserId),
        startWithDepartmentId: 0,
      });
      const payload = raw as unknown as Record<string, unknown> | Array<Record<string, unknown>>;
      const candidates = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.users)
          ? (payload.users as Array<Record<string, unknown>>)
          : [payload];
      const chosen = candidates.flatMap((item) => {
        const id = item.emplId ?? item.userId ?? item.userid;
        if (typeof id !== "string" || typeof item.name !== "string") return [];
        return [{
          dingtalkUserId: id,
          name: item.name,
          department: typeof item.department === "string" ? item.department : null,
        }];
      });
      if (chosen.length === 0) throw new Error("未选择人员，或钉钉未返回有效的人员信息");
      setSelectedUsers((current) => {
        const combined = [...current];
        for (const user of chosen) {
          if (combined.length >= 30) break;
          if (!combined.some((item) => item.dingtalkUserId === user.dingtalkUserId)) combined.push(user);
        }
        return combined;
      });
    } catch (requestError) {
      setDialogError(errorMessage(requestError));
    }
  }

  async function saveMembers() {
    if (!selectedCommittee || selectedUsers.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const added = [] as CommitteeMember[];
      for (const user of selectedUsers) {
        const result = await api.addCommitteeMember(selectedCommittee.id, {
          ...user,
          position: position.trim() || "委员",
        });
        added.push(result.member);
      }
      setMembersByCommittee((current) => ({
        ...current,
        [selectedCommittee.id]: [...(current[selectedCommittee.id] ?? []), ...added],
      }));
      setCommittees((current) =>
        current.map((committee) =>
          committee.id === selectedCommittee.id
            ? { ...committee, memberCount: committee.memberCount + added.length }
            : committee,
        ),
      );
      setAddOpen(false);
      setNotice(`已向${selectedCommittee.name}添加 ${added.length} 名委员`);
    } catch (requestError) {
      setDialogError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function removeMember() {
    if (!selectedCommittee || !removeTarget) return;
    setSaving(true);
    setError(null);
    try {
      await api.removeCommitteeMember(selectedCommittee.id, removeTarget.id);
      setMembersByCommittee((current) => ({
        ...current,
        [selectedCommittee.id]: (current[selectedCommittee.id] ?? []).filter(
          (member) => member.id !== removeTarget.id,
        ),
      }));
      setCommittees((current) =>
        current.map((committee) =>
          committee.id === selectedCommittee.id
            ? { ...committee, memberCount: Math.max(0, committee.memberCount - 1) }
            : committee,
        ),
      );
      setNotice(`已将${removeTarget.name}从${selectedCommittee.name}移除`);
      setRemoveTarget(null);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell area="admin">
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div>
            <h1>委员会管理</h1>
            <p>创建和维护投票小组及其委员名单，变更仅用于后续新建投票。</p>
          </div>
          <div className={styles.headerActions}>
            <Button appearance="primary" icon={<AddRegular />} size="large" onClick={openCreateGroupDialog}>
              新建小组
            </Button>
          </div>
        </header>

        {notice && (
          <MessageBar intent="success" className={styles.message}>
            <MessageBarBody>{notice}</MessageBarBody>
          </MessageBar>
        )}
        {error && !loading && (
          <MessageBar intent="error" className={styles.message}>
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}
        {loading && <PageLoading label="正在加载委员会名单" />}
        {!loading && error && committees.length === 0 && <ErrorState description={error} onRetry={() => void load()} />}

        {!loading && !error && committees.length === 0 && (
          <EmptyState
            title="暂无投票小组"
            description="新建小组后，即可从钉钉通讯录添加委员并发起投票。"
            action={<Button appearance="primary" icon={<AddRegular />} onClick={openCreateGroupDialog}>新建小组</Button>}
          />
        )}

        {!loading && committees.length > 0 && (
          <>
            <section className={styles.committeeGrid} aria-label="委员会选择">
              {committees.map((committee) => {
                const active = memberPanelOpen && committee.id === selectedId;
                return (
                  <article
                    key={committee.id}
                    className={`${styles.committeeCard} ${active ? styles.committeeCardActive : ""}`}
                    aria-label={`${committee.name}，${committee.memberCount} 名在任委员`}
                  >
                    <span className={styles.committeeIcon}><PeopleCommunityRegular /></span>
                    <span className={styles.committeeSummary}>
                      <strong>{committee.name}</strong>
                      <small>{committee.memberCount} 名在任委员</small>
                    </span>
                    <span className={styles.code}>小组</span>
                    <span className={styles.committeeActions}>
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<PersonAddRegular />}
                        onClick={() => openMemberPanel(committee)}
                      >
                        增删查成员
                      </Button>
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<EditRegular />}
                        onClick={() => openRenameGroupDialog(committee)}
                      >
                        重命名
                      </Button>
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<DeleteRegular />}
                        className={styles.dangerButton}
                        onClick={() => setDeleteGroupTarget(committee)}
                      >
                        删除小组
                      </Button>
                    </span>
                  </article>
                );
              })}
            </section>

            {memberPanelOpen && selectedCommittee && <section className={styles.memberSection} aria-label={`${selectedCommittee.name}成员管理`}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionActions}>
                  <SearchBox
                    className={styles.search}
                    value={query}
                    onChange={(_, data) => setQuery(data.value)}
                    placeholder="搜索姓名、部门或职务"
                    aria-label="搜索委员"
                  />
                  <Button
                    appearance="primary"
                    className={styles.addMemberButton}
                    icon={<PersonAddRegular />}
                    onClick={openAddDialog}
                  >
                    添加成员
                  </Button>
                </div>
              </div>

              {filteredMembers.length === 0 ? (
                <EmptyState
                  title={query ? "没有匹配的委员" : "暂无委员"}
                  description={query ? "请尝试其他关键词。" : "请从钉钉通讯录添加委员会成员。"}
                  align="left"
                />
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th>委员</th><th>所属部门</th><th>委员职务</th><th><span className="sr-only">操作</span></th></tr></thead>
                    <tbody>
                      {filteredMembers.map((member) => (
                        <tr key={member.id}>
                          <td><div className={styles.person}><span className={styles.avatar}>{initials(member.name)}</span><div><strong>{member.name}</strong><small>{member.dingtalkUserId}</small></div></div></td>
                          <td>{member.department || "—"}</td>
                          <td><span className={styles.position}>{member.position || "委员"}</span></td>
                          <td className={styles.actions}><Button appearance="subtle" icon={<DeleteRegular />} aria-label={`移除${member.name}`} onClick={() => setRemoveTarget(member)}>移除</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>}
          </>
        )}
      </div>

      <Dialog open={Boolean(groupDialogMode)} onOpenChange={(_, data) => {
        if (!saving && !data.open) {
          setGroupDialogMode(null);
          setRenameGroupTarget(null);
        }
      }}>
        <DialogSurface className={groupDialogMode === "create" ? styles.dialog : undefined}>
          <DialogBody>
            <DialogTitle>{groupDialogMode === "create" ? "新建投票小组" : "重命名小组"}</DialogTitle>
            <DialogContent className={styles.dialogContent}>
              {dialogError && <MessageBar intent="error"><MessageBarBody>{dialogError}</MessageBarBody></MessageBar>}
              <Field label="小组名称" required>
                <Input
                  value={groupName}
                  onChange={(_, data) => setGroupName(data.value)}
                  maxLength={200}
                  autoFocus
                  onKeyDown={(event) => { if (event.key === "Enter") void saveGroup(); }}
                />
              </Field>
              {groupDialogMode === "create" && (
                <>
                  <p className={styles.dialogIntro}>
                    <strong>选择委员（可多选）</strong><br />
                    可选择 0–30 人，创建后仍可继续增删成员。
                  </p>
                  {mockMode ? (
                    <>
                      <SearchBox value={directoryQuery} onChange={(_, data) => setDirectoryQuery(data.value)} placeholder="搜索组织成员" />
                      <div className={styles.directoryList}>
                        {availableMockUsers.map((user) => (
                          <label className={styles.directoryRow} key={user.dingtalkUserId}>
                            <Checkbox
                              checked={selectedUsers.some((item) => item.dingtalkUserId === user.dingtalkUserId)}
                              disabled={selectedUsers.length >= 30 && !selectedUsers.some((item) => item.dingtalkUserId === user.dingtalkUserId)}
                              onChange={(_, data) => toggleDirectoryUser(user, data.checked === true)}
                              aria-label={`选择${user.name}`}
                            />
                            <span className={styles.avatar}>{initials(user.name)}</span>
                            <span><strong>{user.name}</strong><small>{user.department}</small></span>
                          </label>
                        ))}
                        {availableMockUsers.length === 0 && <p className={styles.noDirectoryResult}>未找到匹配的组织成员</p>}
                      </div>
                    </>
                  ) : (
                    <div className={styles.browserDirectory}>
                      <div className={styles.directoryToolbar}>
                        <div className={styles.breadcrumbs} aria-label="通讯录位置">
                          {directoryPath.map((location, index) => (
                            <span key={location.id}>
                              {index > 0 && <span className={styles.breadcrumbSeparator}>/</span>}
                              <button
                                type="button"
                                onClick={() => returnToDirectory(index)}
                                disabled={index === directoryPath.length - 1 || directoryLoading}
                              >
                                {location.name}
                              </button>
                            </span>
                          ))}
                        </div>
                        {isInDingTalk && (
                          <Button appearance="secondary" size="small" onClick={() => void chooseFromDingTalk()}>
                            使用钉钉选择器
                          </Button>
                        )}
                      </div>
                      <SearchBox
                        value={directoryQuery}
                        onChange={(_, data) => setDirectoryQuery(data.value)}
                        placeholder="搜索企业通讯录人员"
                        aria-label="搜索企业通讯录人员"
                      />
                      <div className={styles.directoryList} aria-busy={directoryLoading || directorySearchLoading}>
                        {!directoryQuery.trim() && directoryDepartments.map((department) => (
                          <button
                            type="button"
                            className={styles.departmentRow}
                            key={department.id}
                            onClick={() => enterDepartment(department)}
                            disabled={directoryLoading}
                          >
                            <PeopleCommunityRegular />
                            <span><strong>{department.name}</strong><small>进入部门选择人员</small></span>
                            <span aria-hidden="true">›</span>
                          </button>
                        ))}
                        {visibleDirectoryUsers.map((user) => (
                          <label className={styles.directoryRow} key={user.dingtalkUserId}>
                            <Checkbox
                              checked={selectedUsers.some((item) => item.dingtalkUserId === user.dingtalkUserId)}
                              disabled={selectedUsers.length >= 30 && !selectedUsers.some((item) => item.dingtalkUserId === user.dingtalkUserId)}
                              onChange={(_, data) => toggleDirectoryUser(user, data.checked === true)}
                              aria-label={`选择${user.name}`}
                            />
                            <span className={styles.avatar}>{initials(user.name)}</span>
                            <span><strong>{user.name}</strong><small>{user.department || user.title || "钉钉通讯录"}</small></span>
                          </label>
                        ))}
                        {(directoryLoading || directorySearchLoading) && <div className={styles.directoryLoading}><Spinner size="small" label={directoryQuery.trim() ? "正在搜索通讯录" : "正在读取通讯录"} /></div>}
                        {!directoryLoading && !directorySearchLoading && (!directoryQuery.trim() ? directoryDepartments.length === 0 : true) && visibleDirectoryUsers.length === 0 && (
                          <p className={styles.noDirectoryResult}>{directoryQuery.trim() ? "未找到匹配的企业通讯录人员" : "当前部门暂无可选人员"}</p>
                        )}
                        {!directoryQuery.trim() && !directoryLoading && directoryHasMore && directoryCursor !== undefined && (
                          <Button appearance="subtle" className={styles.loadMore} onClick={() => void loadDirectory(directoryPath.at(-1) ?? directoryRoot, directoryCursor, true)}>
                            加载更多人员
                          </Button>
                        )}
                        {directoryQuery.trim() && !directorySearchLoading && directorySearchHasMore && directorySearchCursor !== undefined && (
                          <Button appearance="subtle" className={styles.loadMore} onClick={() => void searchDirectory(directoryQuery.trim(), directorySearchCursor, true)}>
                            加载更多搜索结果
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedUsers.length > 0 && <div className={styles.selectionSummary}>已选择 {selectedUsers.length}/30 人：{selectedUsers.map((user) => user.name).join("、")}</div>}
                  <Field label="委员职务" hint="本次选择的人员将使用同一职务。">
                    <Input value={position} onChange={(_, data) => setPosition(data.value)} maxLength={100} />
                  </Field>
                </>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => { setGroupDialogMode(null); setRenameGroupTarget(null); }} disabled={saving}>取消</Button>
              <Button appearance="primary" onClick={() => void saveGroup()} disabled={saving || !groupName.trim()}>
                {saving ? <Spinner size="tiny" /> : groupDialogMode === "create" ? "创建" : "保存"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={Boolean(deleteGroupTarget)} onOpenChange={(_, data) => !saving && !data.open && setDeleteGroupTarget(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>删除小组</DialogTitle>
            <DialogContent className={styles.dialogContent}>
              {dialogError && <MessageBar intent="error"><MessageBarBody>{dialogError}</MessageBarBody></MessageBar>}
              <p>确定删除“{deleteGroupTarget?.name}”吗？该小组的当前委员关系也会删除。已有投票记录的小组不能删除。</p>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setDeleteGroupTarget(null)} disabled={saving}>取消</Button>
              <Button appearance="primary" onClick={() => void deleteGroup()} disabled={saving}>
                {saving ? <Spinner size="tiny" /> : "确认删除"}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={(_, data) => !saving && setAddOpen(data.open)}>
        <DialogSurface className={styles.dialog}>
          <DialogBody>
            <DialogTitle>向{selectedCommittee?.name}添加委员</DialogTitle>
            <DialogContent className={styles.dialogContent}>
              <p className={styles.dialogIntro}>
                {mockMode ? "当前为演示环境，以下人员来自模拟的钉钉组织通讯录。" : "浏览钉钉企业组织架构选择人员，确认后加入委员会名单。"}
              </p>
              {dialogError && (
                <MessageBar intent="error">
                  <MessageBarBody>{dialogError}</MessageBarBody>
                </MessageBar>
              )}
              {mockMode ? (
                <>
                  <SearchBox value={directoryQuery} onChange={(_, data) => setDirectoryQuery(data.value)} placeholder="搜索组织成员" />
                  <div className={styles.directoryList}>
                    {availableMockUsers.map((user) => (
                      <label className={styles.directoryRow} key={user.dingtalkUserId}>
                        <Checkbox
                          checked={selectedUsers.some((item) => item.dingtalkUserId === user.dingtalkUserId)}
                          onChange={(_, data) => toggleDirectoryUser(user, data.checked === true)}
                          aria-label={`选择${user.name}`}
                        />
                        <span className={styles.avatar}>{initials(user.name)}</span>
                        <span><strong>{user.name}</strong><small>{user.department}</small></span>
                      </label>
                    ))}
                    {availableMockUsers.length === 0 && <p className={styles.noDirectoryResult}>没有可添加的组织成员</p>}
                  </div>
                </>
              ) : (
                <div className={styles.browserDirectory}>
                  <div className={styles.directoryToolbar}>
                    <div className={styles.breadcrumbs} aria-label="通讯录位置">
                      {directoryPath.map((location, index) => (
                        <span key={location.id}>
                          {index > 0 && <span className={styles.breadcrumbSeparator}>/</span>}
                          <button
                            type="button"
                            onClick={() => returnToDirectory(index)}
                            disabled={index === directoryPath.length - 1 || directoryLoading}
                          >
                            {location.name}
                          </button>
                        </span>
                      ))}
                    </div>
                    {isInDingTalk && (
                      <Button appearance="secondary" size="small" onClick={() => void chooseFromDingTalk()}>
                        使用钉钉选择器
                      </Button>
                    )}
                  </div>
                  <SearchBox
                    value={directoryQuery}
                    onChange={(_, data) => setDirectoryQuery(data.value)}
                    placeholder="搜索企业通讯录人员"
                    aria-label="搜索企业通讯录人员"
                  />
                  <div className={styles.directoryList} aria-busy={directoryLoading || directorySearchLoading}>
                    {!directoryQuery.trim() && directoryDepartments.map((department) => (
                      <button
                        type="button"
                        className={styles.departmentRow}
                        key={department.id}
                        onClick={() => enterDepartment(department)}
                        disabled={directoryLoading}
                      >
                        <PeopleCommunityRegular />
                        <span><strong>{department.name}</strong><small>进入部门选择人员</small></span>
                        <span aria-hidden="true">›</span>
                      </button>
                    ))}
                    {visibleDirectoryUsers.map((user) => (
                      <label className={styles.directoryRow} key={user.dingtalkUserId}>
                        <Checkbox
                          checked={selectedUsers.some((item) => item.dingtalkUserId === user.dingtalkUserId)}
                          disabled={selectedUsers.length >= 30 && !selectedUsers.some((item) => item.dingtalkUserId === user.dingtalkUserId)}
                          onChange={(_, data) => toggleDirectoryUser(user, data.checked === true)}
                          aria-label={`选择${user.name}`}
                        />
                        <span className={styles.avatar}>{initials(user.name)}</span>
                        <span><strong>{user.name}</strong><small>{user.department || user.title || "钉钉通讯录"}</small></span>
                      </label>
                    ))}
                    {(directoryLoading || directorySearchLoading) && <div className={styles.directoryLoading}><Spinner size="small" label={directoryQuery.trim() ? "正在搜索通讯录" : "正在读取通讯录"} /></div>}
                    {!directoryLoading && !directorySearchLoading && (!directoryQuery.trim() ? directoryDepartments.length === 0 : true) && visibleDirectoryUsers.length === 0 && (
                      <p className={styles.noDirectoryResult}>{directoryQuery.trim() ? "未找到匹配的企业通讯录人员" : "当前部门暂无可添加人员"}</p>
                    )}
                    {!directoryQuery.trim() && !directoryLoading && directoryHasMore && directoryCursor !== undefined && (
                      <Button
                        appearance="subtle"
                        className={styles.loadMore}
                        onClick={() => void loadDirectory(directoryPath.at(-1) ?? directoryRoot, directoryCursor, true)}
                      >
                        加载更多人员
                      </Button>
                    )}
                    {directoryQuery.trim() && !directorySearchLoading && directorySearchHasMore && directorySearchCursor !== undefined && (
                      <Button
                        appearance="subtle"
                        className={styles.loadMore}
                        onClick={() => void searchDirectory(directoryQuery.trim(), directorySearchCursor, true)}
                      >
                        加载更多搜索结果
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {selectedUsers.length > 0 && <div className={styles.selectionSummary}>已选择 {selectedUsers.length}/30 人：{selectedUsers.map((user) => user.name).join("、")}</div>}
              <Field label="委员职务" hint="本次选择的人员将使用同一职务，可添加后再调整。">
                <Input value={position} onChange={(_, data) => setPosition(data.value)} maxLength={100} />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setAddOpen(false)} disabled={saving}>取消</Button>
              <Button appearance="primary" onClick={() => void saveMembers()} disabled={saving || selectedUsers.length === 0}>
                {saving ? <Spinner size="tiny" /> : `添加${selectedUsers.length ? `（${selectedUsers.length}）` : ""}`}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={Boolean(removeTarget)} onOpenChange={(_, data) => !saving && !data.open && setRemoveTarget(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>移除委员</DialogTitle>
            <DialogContent>
              确定将“{removeTarget?.name}”从{selectedCommittee?.name}移除吗？此操作仅影响后续新建的投票。
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setRemoveTarget(null)} disabled={saving}>取消</Button>
              <Button appearance="primary" onClick={() => void removeMember()} disabled={saving}>确认移除</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </AppShell>
  );
}
