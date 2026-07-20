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
  Field,
  Input,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import { AddRegular, PersonRegular } from "@fluentui/react-icons";
import { useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import type { Initiator } from "@/lib/client/types";
import styles from "./InitiatorManagement.module.css";

interface FormState {
  name: string;
  department: string;
  dingtalkUserId: string;
}

const emptyForm: FormState = { name: "", department: "", dingtalkUserId: "" };

export function InitiatorManagement({ initialInitiators }: { initialInitiators: Initiator[] }) {
  const { user } = useSession();
  const [initiators, setInitiators] = useState(initialInitiators);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [addOpen, setAddOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Initiator | null>(null);
  const activeCount = useMemo(
    () => initiators.filter((initiator) => initiator.isActive).length,
    [initiators],
  );

  function openAdd() {
    setForm(emptyForm);
    setAttempted(false);
    setError(null);
    setNotice(null);
    setAddOpen(true);
  }

  async function add() {
    setAttempted(true);
    if (!form.name.trim() || !form.dingtalkUserId.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.addInitiator({
        name: form.name.trim(),
        department: form.department.trim() || null,
        dingtalkUserId: form.dingtalkUserId.trim(),
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
            <DialogContent>
              <p className={styles.dialogIntro}>请填写与钉钉通讯录一致的用户 ID。账号添加后即可进入管理端发起投票。</p>
              {error && (
                <MessageBar intent="error" className={styles.dialogMessage}>
                  <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
              )}
              <form id="add-initiator-form" className={styles.form} onSubmit={(event) => { event.preventDefault(); void add(); }}>
                <Field label="姓名" required validationState={attempted && !form.name.trim() ? "error" : "none"} validationMessage={attempted && !form.name.trim() ? "请输入姓名" : undefined}>
                  <Input value={form.name} onChange={(_, data) => setForm((current) => ({ ...current, name: data.value }))} />
                </Field>
                <Field label="部门" hint="选填">
                  <Input value={form.department} onChange={(_, data) => setForm((current) => ({ ...current, department: data.value }))} />
                </Field>
                <Field label="钉钉用户 ID" required hint="使用稳定的通讯录 userId，不要填写手机号。" validationState={attempted && !form.dingtalkUserId.trim() ? "error" : "none"} validationMessage={attempted && !form.dingtalkUserId.trim() ? "请输入钉钉用户 ID" : undefined}>
                  <Input value={form.dingtalkUserId} onChange={(_, data) => setForm((current) => ({ ...current, dingtalkUserId: data.value }))} autoComplete="off" />
                </Field>
              </form>
            </DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement><Button appearance="secondary" disabled={saving}>取消</Button></DialogTrigger>
              <Button appearance="primary" type="submit" form="add-initiator-form" disabled={saving}>{saving ? "正在添加" : "确认添加"}</Button>
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
