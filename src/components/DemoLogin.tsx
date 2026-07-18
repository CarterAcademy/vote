"use client";

import {
  Badge,
  Button,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import { CheckmarkCircleFilled } from "@fluentui/react-icons";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import type { DemoUser } from "@/lib/client/types";
import { PageLoading } from "./PageState";
import styles from "./DemoLogin.module.css";

export function DemoLogin() {
  const router = useRouter();
  const { user, demoUsers, mockMode, loading, setAuthenticatedUser } = useSession();
  const [selectedId, setSelectedId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedUsers = useMemo(
    () => [...demoUsers].sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name, "zh-CN") : a.role === "HR" ? -1 : 1)),
    [demoUsers],
  );

  const displayUsers = useMemo(() => {
    const seen = new Set<string>();
    return sortedUsers.filter((candidate) => {
      const group = candidate.role === "HR" ? "HR" : candidate.committeeName ?? candidate.department ?? "MEMBER";
      if (seen.has(group)) return false;
      seen.add(group);
      return true;
    });
  }, [sortedUsers]);

  useEffect(() => {
    if (!selectedId && displayUsers[0]) setSelectedId(displayUsers[0].id);
  }, [displayUsers, selectedId]);

  if (loading) return <PageLoading label="正在准备演示账号" />;

  async function login() {
    if (!selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      const session = await api.demoLogin(selectedId);
      if (!session.user) throw new Error("演示登录未返回用户信息");
      setAuthenticatedUser(session.user);
      router.replace(session.user.role === "HR" ? "/admin" : "/vote");
      router.refresh();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  if (!mockMode) {
    return (
      <main className={styles.page}>
        <section className={styles.wrap} style={{ display: "block", maxWidth: 540, padding: 36 }}>
          <h1>演示登录未启用</h1>
          <p className={styles.lead}>生产环境请从钉钉工作台或群聊应用入口进入。</p>
          <Button appearance="primary" onClick={() => router.replace("/")}>返回身份验证</Button>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.wrap} aria-labelledby="demo-title">
        <div className={styles.intro}>
          <div>
            <span className={styles.mark} aria-hidden="true">评</span>
            <h1>两委会人选评审投票</h1>
          </div>
          <p>记名投票，实时统计，记录长期留存。正式环境由钉钉自动识别身份。</p>
        </div>

        <div className={styles.formPanel}>
          <h2 id="demo-title">选择演示身份</h2>
          <p className={styles.lead}>切换角色，体验委员投票和 HR 管理流程。</p>

          {error && (
            <MessageBar intent="error" style={{ marginTop: 18 }}>
              <MessageBarBody>{error}</MessageBarBody>
            </MessageBar>
          )}

          {user && (
            <MessageBar intent="info" style={{ marginTop: 18 }}>
              <MessageBarBody>当前已登录为 {user.name}，继续登录会切换演示身份。</MessageBarBody>
            </MessageBar>
          )}

          <div className={styles.users} role="radiogroup" aria-label="演示身份">
            {displayUsers.map((demoUser: DemoUser) => {
              const selected = selectedId === demoUser.id;
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  key={demoUser.id}
                  className={`${styles.userOption} ${selected ? styles.userSelected : ""}`}
                  onClick={() => setSelectedId(demoUser.id)}
                >
                  <span className={styles.avatar} aria-hidden="true">{demoUser.name.slice(0, 1)}</span>
                  <span className={styles.userMeta}>
                    <span className={styles.userName}>{demoUser.name}</span>
                    <span className={styles.userDetail}>
                      {demoUser.role === "HR" ? "HR 管理员" : demoUser.committeeName ?? demoUser.department ?? "委员会委员"}
                    </span>
                  </span>
                  {selected ? <CheckmarkCircleFilled color="#00695c" aria-hidden="true" /> : (
                    <Badge appearance="outline">{demoUser.role === "HR" ? "管理端" : "委员端"}</Badge>
                  )}
                </button>
              );
            })}
          </div>

          {displayUsers.length === 0 && (
            <MessageBar intent="warning">
              <MessageBarBody>暂未发现演示账号，请先运行初始化数据脚本。</MessageBarBody>
            </MessageBar>
          )}

          <div className={styles.footer}>
            <Button
              appearance="primary"
              size="large"
              disabled={!selectedId || submitting}
              onClick={() => void login()}
            >
              {submitting ? "正在进入" : "进入系统"}
            </Button>
            <span className={styles.hint}>仅用于本地演示。正式部署不显示身份选择器。</span>
          </div>
        </div>
      </section>
    </main>
  );
}
