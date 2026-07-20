"use client";

import { Button, Input, MessageBar, MessageBarBody, Skeleton, SkeletonItem } from "@fluentui/react-components";
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
  const [webLogin, setWebLogin] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("");
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
        setWebLogin(true);
        throw new Error("当前在浏览器中，请使用钉钉扫码或账号登录。");
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

  const completeWebLogin = useCallback(async () => {
    setAuthenticating(true);
    setError(null);
    try {
      const callback = new URL(callbackUrl.trim());
      const authCode = callback.searchParams.get("authCode") ?? callback.searchParams.get("code");
      const state = callback.searchParams.get("state");
      if (!authCode || !state) {
        throw new Error("回调地址中缺少钉钉授权码或登录状态");
      }
      const session = await api.dingtalkWebComplete(authCode, state);
      if (!session.user) throw new Error("钉钉身份未绑定系统用户，请联系 HR 管理员。");
      setAuthenticatedUser(session.user);
      router.replace(session.user.role === "HR" ? "/admin" : "/vote");
      router.refresh();
    } catch (authError) {
      setError(errorMessage(authError));
    } finally {
      setAuthenticating(false);
    }
  }, [callbackUrl, router, setAuthenticatedUser]);

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
            <Button
              appearance="primary"
              onClick={() => {
                if (webLogin) {
                  window.location.assign("/api/auth/dingtalk/web/start");
                } else {
                  void authenticate();
                }
              }}
              disabled={authenticating}
            >
              {webLogin ? "使用钉钉登录" : "重新验证"}
            </Button>
            {webLogin && (
              <div className={styles.manualLogin}>
                <p>若 Chrome 阻止返回本机，请复制地址栏中的完整回调地址，在此粘贴后完成登录。</p>
                <Input
                  aria-label="钉钉授权回调地址"
                  placeholder="粘贴包含 authCode 和 state 的回调地址"
                  value={callbackUrl}
                  onChange={(_, data) => setCallbackUrl(data.value)}
                />
                <Button
                  appearance="secondary"
                  onClick={() => void completeWebLogin()}
                  disabled={authenticating || !callbackUrl.trim()}
                >
                  完成钉钉登录
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
