"use client";

import {
  Badge,
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
} from "@fluentui/react-components";
import { AddRegular, PersonRegular } from "@fluentui/react-icons";
import { useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import type { Initiator } from "@/lib/client/types";
import { DirectoryPersonPicker, type DirectoryPerson } from "./DirectoryPersonPicker";
import styles from "./InitiatorManagement.module.css";

export function InitiatorManagement({ initialInitiators }: { initialInitiators: Initiator[] }) {
  const { user, mockMode = false, corpId } = useSession();
  const [initiators, setInitiators] = useState(initialInitiators);
  const [selectedPerson, setSelectedPerson] = useState<DirectoryPerson | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Initiator | null>(null);
  const activeCount = useMemo(
    () => initiators.filter((initiator) => initiator.isActive).length,
    [initiators],
  );

  function openAdd() {
    setSelectedPerson(null);
    setError(null);
    setNotice(null);
    setAddOpen(true);
  }

  async function add() {
    if (!selectedPerson) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.addInitiator({
        name: selectedPerson.name,
        department: selectedPerson.department,
        dingtalkUserId: selectedPerson.dingtalkUserId,
      });
      setInitiators((current) => {
        const exists = current.some((initiator) => initiator.id === result.initiator.id);
        return exists
          ? current.map((initiator) => initiator.id === result.initiator.id ? result.initiator : initiator)
          : [...current, result.initiator];
      });
      setNotice(`已添加发起人${result.initiator.name}`);
      setAddOpen(false);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    if (!toggleTarget) return;
    const nextActive = !toggleTarget.isActive;
    setSaving(true);
    setError(null);
    try {
      const result = await api.setInitiatorActive(toggleTarget.id, nextActive);
      setInitiators((current) =>
        current.map((initiator) =>
          initiator.id === result.initiator.id ? result.initiator : initiator,
        ),
      );
      setNotice(`${result.initiator.name}已${nextActive ? "启用" : "停用"}`);
      setToggleTarget(null);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="initiator-title">
      <div className={styles.header}>
        <div>
          <h2 id="initiator-title">发起人管理</h2>
          <p>{activeCount} 名启用中的发起人。停用后将无法登录，历史投票仍会保留。</p>
        </div>
        <Button appearance="secondary" icon={<AddRegular />} onClick={openAdd}>添加发起人</Button>
      </div>

      {notice && (
        <MessageBar intent="success" className={styles.message}>
          <MessageBarBody>{notice}</MessageBarBody>
        </MessageBar>
      )}
      {error && (
        <MessageBar intent="error" className={styles.message}>
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.list}>
        {initiators.map((initiator) => {
          const isSelf = initiator.id === user?.id;
          const cannotDeactivate = isSelf || (initiator.isActive && activeCount <= 1);
          return (
            <article className={styles.row} key={initiator.id}>
              <span className={styles.avatar} aria-hidden="true"><PersonRegular /></span>
              <div className={styles.identity}>
                <strong>{initiator.name}{isSelf ? "（当前账号）" : ""}</strong>
                <span>{initiator.department || "未填写部门"}</span>
              </div>
              <code className={styles.userId}>{initiator.dingtalkUserId}</code>
              <span className={styles.pollCount}>{initiator.pollCount} 场投票</span>
              <Badge appearance="tint" color={initiator.isActive ? "success" : "subtle"}>
                {initiator.isActive ? "已启用" : "已停用"}
              </Badge>
              <Button
                appearance="subtle"
                disabled={saving || cannotDeactivate}
                onClick={() => { setNotice(null); setToggleTarget(initiator); }}
              >
                {initiator.isActive ? "停用" : "启用"}
              </Button>
            </article>
          );
        })}
      </div>

      <Dialog open={addOpen} onOpenChange={(_, data) => setAddOpen(data.open)}>
        <DialogSurface className={styles.dialog}>
          <DialogBody>
            <DialogTitle>添加发起人</DialogTitle>
            <DialogContent className={styles.dialogContent}>
              <p className={styles.dialogIntro}>
                {mockMode ? "当前为演示环境，请从模拟的组织通讯录中选择人员。" : "搜索姓名，或按组织架构浏览并选择人员。添加后即可进入管理端发起投票。"}
              </p>
              {error && (
                <MessageBar intent="error" className={styles.dialogMessage}>
                  <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
              )}
              <DirectoryPersonPicker
                open={addOpen}
                mockMode={mockMode}
                corpId={corpId}
                excludedUserIds={initiators.map((initiator) => initiator.dingtalkUserId)}
                selected={selectedPerson}
                onSelect={setSelectedPerson}
              />
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement><Button appearance="secondary" disabled={saving}>取消</Button></DialogTrigger>
              <Button appearance="primary" onClick={() => void add()} disabled={saving || !selectedPerson}>{saving ? "正在添加" : "确认添加"}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={Boolean(toggleTarget)} onOpenChange={(_, data) => { if (!data.open) setToggleTarget(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{toggleTarget?.isActive ? "停用发起人" : "启用发起人"}</DialogTitle>
            <DialogContent>
              {toggleTarget?.isActive
                ? `停用后，${toggleTarget.name}将无法登录或发起投票。历史记录不会删除。`
                : `启用后，${toggleTarget?.name}可以重新登录并发起投票。`}
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement><Button appearance="secondary" disabled={saving}>取消</Button></DialogTrigger>
              <Button appearance="primary" onClick={() => void toggleActive()} disabled={saving}>{saving ? "正在保存" : "确认"}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </section>
  );
}
