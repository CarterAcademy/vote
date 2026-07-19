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
  PeopleCommunityRegular,
  PersonAddRegular,
} from "@fluentui/react-icons";
import { useCallback, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, ErrorState, PageLoading } from "@/components/PageState";
import { api, errorMessage } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import type { Committee, CommitteeMember } from "@/lib/client/types";
import styles from "./CommitteeManagement.module.css";

interface DirectoryUser {
  dingtalkUserId: string;
  name: string;
  department: string;
}

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
  const availableMockUsers = useMemo(() => {
    const memberIds = new Set(members.map((member) => member.dingtalkUserId));
    const normalized = directoryQuery.trim().toLowerCase();
    return mockDirectory.filter(
      (user) =>
        !memberIds.has(user.dingtalkUserId) &&
        (!normalized || `${user.name}${user.department}`.toLowerCase().includes(normalized)),
    );
  }, [directoryQuery, members]);

  function openAddDialog() {
    setSelectedUsers([]);
    setDirectoryQuery("");
    setPosition("委员");
    setNotice(null);
    setAddOpen(true);
  }

  function toggleMockUser(user: DirectoryUser, checked: boolean) {
    setSelectedUsers((current) =>
      checked
        ? [...current, user]
        : current.filter((item) => item.dingtalkUserId !== user.dingtalkUserId),
    );
  }

  async function chooseFromDingTalk() {
    setError(null);
    try {
      if (!corpId) throw new Error("缺少钉钉企业 ID，请联系管理员检查配置");
      const dd = await import("dingtalk-jsapi");
      if (dd.env.platform === "notInDingTalk") {
        throw new Error("请在钉钉客户端内打开本页面后选择组织成员");
      }
      const raw = await dd.biz.contact.choose({
        corpId,
        multiple: true,
        max: 30,
        users: members.map((member) => member.dingtalkUserId),
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
          department: typeof item.department === "string" ? item.department : "钉钉通讯录",
        }];
      });
      if (chosen.length === 0) throw new Error("未选择人员，或钉钉未返回有效的人员信息");
      setSelectedUsers(chosen);
    } catch (requestError) {
      setError(errorMessage(requestError));
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
      setError(errorMessage(requestError));
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
            <p>维护中关村两院学术委员会和技术委员会名单，变更将用于后续新建投票。</p>
          </div>
          <Button appearance="primary" icon={<PersonAddRegular />} size="large" onClick={openAddDialog} disabled={!selectedCommittee}>
            添加委员
          </Button>
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

        {!loading && committees.length > 0 && (
          <>
            <section className={styles.committeeGrid} aria-label="委员会选择">
              {committees.map((committee) => {
                const active = committee.id === selectedId;
                return (
                  <button
                    type="button"
                    key={committee.id}
                    className={`${styles.committeeCard} ${active ? styles.committeeCardActive : ""}`}
                    onClick={() => { setSelectedId(committee.id); setQuery(""); setNotice(null); }}
                    aria-pressed={active}
                  >
                    <span className={styles.committeeIcon}><PeopleCommunityRegular /></span>
                    <span>
                      <strong>{committee.name}</strong>
                      <small>{committee.memberCount} 名在任委员</small>
                    </span>
                    <span className={styles.code}>{committee.code === "ACADEMIC" ? "学术" : "技术"}</span>
                  </button>
                );
              })}
            </section>

            <section className={styles.memberSection} aria-labelledby="member-list-title">
              <div className={styles.sectionHeader}>
                <div>
                  <h2 id="member-list-title">{selectedCommittee?.name}委员名单</h2>
                  <p>名单变更不影响已经发起的投票和历史记录。</p>
                </div>
                <SearchBox
                  className={styles.search}
                  value={query}
                  onChange={(_, data) => setQuery(data.value)}
                  placeholder="搜索姓名、部门或职务"
                  aria-label="搜索委员"
                />
              </div>

              {filteredMembers.length === 0 ? (
                <EmptyState
                  title={query ? "没有匹配的委员" : "暂无委员"}
                  description={query ? "请尝试其他关键词。" : "请从钉钉通讯录添加委员会成员。"}
                  action={!query && <Button appearance="primary" icon={<AddRegular />} onClick={openAddDialog}>添加委员</Button>}
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
            </section>
          </>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={(_, data) => !saving && setAddOpen(data.open)}>
        <DialogSurface className={styles.dialog}>
          <DialogBody>
            <DialogTitle>向{selectedCommittee?.name}添加委员</DialogTitle>
            <DialogContent className={styles.dialogContent}>
              <p className={styles.dialogIntro}>
                {mockMode ? "当前为演示环境，以下人员来自模拟的钉钉组织通讯录。" : "从钉钉企业通讯录选择人员，确认后加入委员会名单。"}
              </p>
              {mockMode ? (
                <>
                  <SearchBox value={directoryQuery} onChange={(_, data) => setDirectoryQuery(data.value)} placeholder="搜索组织成员" />
                  <div className={styles.directoryList}>
                    {availableMockUsers.map((user) => (
                      <label className={styles.directoryRow} key={user.dingtalkUserId}>
                        <Checkbox
                          checked={selectedUsers.some((item) => item.dingtalkUserId === user.dingtalkUserId)}
                          onChange={(_, data) => toggleMockUser(user, data.checked === true)}
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
                <div className={styles.dingTalkPicker}>
                  <PeopleCommunityRegular />
                  <div><strong>钉钉企业通讯录</strong><p>支持按组织架构查找，一次最多选择 30 人。</p></div>
                  <Button appearance="primary" onClick={() => void chooseFromDingTalk()}>打开通讯录</Button>
                </div>
              )}
              {selectedUsers.length > 0 && <div className={styles.selectionSummary}>已选择 {selectedUsers.length} 人：{selectedUsers.map((user) => user.name).join("、")}</div>}
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
