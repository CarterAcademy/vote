"use client";

import { Button, MessageBar, MessageBarBody, Skeleton, SkeletonItem } from "@fluentui/react-components";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import styles from "./DingTalkAuthBootstrap.module.css";

export function DingTalkAuthBootstrap() {
  const router = useRouter();
  const { corpId, setAuthenticatedUser } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState(false);
  const attempted = useRef(false);
  const authenticate = useCallback(async () => {
    if (!corpId) {
      setError("系统缺少钉钉企业配置，请联系管理员检查环境变量。");
      return;
    }

    setAuthenticating(true);
    setError(null);
    try {
      const dd = await import("dingtalk-jsapi");
      if (dd.env.platform === "notInDingTalk") {
        throw new Error("请从钉钉工作台或群聊中的应用入口打开本系统。");
      }
      const result = await dd.runtime.permission.requestAuthCode({ corpId });
      const session = await api.dingtalkLogin(result.code);
      if (!session.user) throw new Error("钉钉身份未绑定系统用户，请联系 HR 管理员。");
      setAuthenticatedUser(session.user);
      router.replace(session.user.role === "HR" ? "/admin" : "/vote");
      router.refresh();
    } catch (authError) {
      setError(errorMessage(authError));
    } finally {
      setAuthenticating(false);
    }
  }, [corpId, router, setAuthenticatedUser]);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    void authenticate();
  }, [authenticate]);

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="auth-title">
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">评</span>
          <div>
            <h1 id="auth-title">正在验证钉钉身份</h1>
            <p>两委会人选评审投票</p>
          </div>
        </div>

        {authenticating && (
          <Skeleton className={styles.loading} aria-label="正在进行钉钉免登">
            <SkeletonItem size={16} style={{ width: "92%" }} />
            <SkeletonItem size={16} style={{ width: "68%" }} />
          </Skeleton>
        )}

        {error && (
          <>
            <MessageBar intent="error">
              <MessageBarBody>{error}</MessageBarBody>
            </MessageBar>
            <Button appearance="primary" onClick={() => void authenticate()} disabled={authenticating}>
              重新验证
            </Button>
          </>
        )}
      </section>
    </main>
  );
}
