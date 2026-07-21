"use client";

import { Button, MessageBar, MessageBarBody } from "@fluentui/react-components";
import {
  ArrowRightRegular,
  BotRegular,
  EditRegular,
  HistoryRegular,
  LinkRegular,
  MicRegular,
  MegaphoneRegular,
  PeopleCommunityRegular,
  SearchRegular,
  ShieldPersonRegular,
} from "@fluentui/react-icons";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import styles from "./ProductLanding.module.css";

type LoginMode = "authenticated" | "checking" | "dingtalk" | "browser" | "error";

export function ProductLanding() {
  const router = useRouter();
  const { user, corpId, setAuthenticatedUser } = useSession();
  const [loginMode, setLoginMode] = useState<LoginMode>(user ? "authenticated" : "checking");
  const [loginError, setLoginError] = useState<string | null>(null);
  const attempted = useRef(false);

  const authenticateInDingTalk = useCallback(async () => {
    if (!corpId) {
      setLoginMode("error");
      setLoginError("系统缺少钉钉企业配置，请联系管理员检查环境变量。");
      return;
    }

    setLoginError(null);
    setLoginMode("checking");
    try {
      const dd = await import("dingtalk-jsapi");
      if (dd.env.platform === "notInDingTalk") {
        setLoginMode("browser");
        return;
      }

      setLoginMode("dingtalk");
      const result = await dd.runtime.permission.requestAuthCode({ corpId });
      const session = await api.dingtalkLogin(result.code);
      if (!session.user) throw new Error("钉钉身份尚未绑定系统用户，请联系管理员。");
      setAuthenticatedUser(session.user);
      setLoginMode("authenticated");
    } catch (authError) {
      setLoginMode("error");
      setLoginError(errorMessage(authError));
    }
  }, [corpId, setAuthenticatedUser]);

  useEffect(() => {
    if (user) {
      attempted.current = true;
      setLoginMode("authenticated");
      return;
    }
    if (attempted.current) return;
    attempted.current = true;
    void authenticateInDingTalk();
  }, [authenticateInDingTalk, user]);

  function enterSystem() {
    if (user) {
      router.push(user.role === "HR" ? "/admin" : "/vote");
      return;
    }
    if (loginMode === "browser") {
      window.location.assign("/api/auth/dingtalk/web/start");
      return;
    }
    void authenticateInDingTalk();
  }

  const isChecking = loginMode === "checking" || loginMode === "dingtalk";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="#top" aria-label="两委会评审投票首页">
          <span className={styles.brandMark} aria-hidden="true">评</span>
          <span>两委会评审投票</span>
        </a>
        <nav className={styles.nav} aria-label="产品介绍导航">
          <a href="#roles">角色与权限</a>
          <a href="#entry">如何进入投票</a>
          <a href="#questions">常见问题</a>
        </nav>
      </header>

      <section className={styles.hero} id="top" aria-labelledby="product-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>委员会评审协作平台</p>
          <h1 id="product-title">让每一次评审投票，都清晰抵达</h1>
          <p className={styles.heroText}>统一组织委员、发起投票并定向提醒，让评审过程更及时、更有序。</p>
          <div className={styles.loginArea}>
            <Button
              appearance="primary"
              size="large"
              icon={<ArrowRightRegular />}
              iconPosition="after"
              onClick={enterSystem}
              disabled={isChecking}
              className={styles.primaryAction}
            >
              {user
                ? user.role === "HR" ? "进入管理端" : "进入我的投票"
                : isChecking ? "正在确认身份" : loginMode === "error" ? "重新验证" : "使用钉钉登录"}
            </Button>
            <span>
              {user
                ? `已登录：${user.name}`
                : loginMode === "browser" ? "支持标准浏览器登录" : "钉钉内将自动完成身份验证"}
            </span>
          </div>
          {loginError && (
            <MessageBar intent="error" className={styles.loginMessage}>
              <MessageBarBody>{loginError}</MessageBarBody>
            </MessageBar>
          )}
        </div>

        <div className={styles.heroVisual}>
          <Image
            src="/committee-vote-hero-web.png"
            alt="委员会成员围绕评审材料进行讨论"
            width={1200}
            height={800}
            priority
            sizes="(max-width: 767px) 100vw, 52vw"
          />
          <div className={styles.visualCaption}>
            <strong>一处发起，多端抵达</strong>
            <span>评审、提醒、投票在同一流程内完成</span>
          </div>
        </div>
      </section>

      <section className={styles.rolesSection} id="roles" aria-labelledby="roles-title">
        <div className={styles.sectionHeading}>
          <h2 id="roles-title">职责分开，身份可以重叠</h2>
          <p>三个角色独立配置。一个人可以同时兼任三个角色，实际权限为所拥有角色权限的合集。</p>
        </div>

        <div className={styles.roleGrid}>
          <article className={`${styles.rolePanel} ${styles.committeeRole}`}>
            <PeopleCommunityRegular aria-hidden="true" />
            <div>
              <h3>委员会成员</h3>
              <p>参与被分配的评审投票。委员会可按实际需要组建，默认设置学术委员会与技术委员会。</p>
            </div>
            <span>由管理员或投票发起人维护成员</span>
          </article>

          <article className={styles.rolePanel}>
            <MegaphoneRegular aria-hidden="true" />
            <div>
              <h3>投票发起人</h3>
              <p>管理委员会与投票，选择参与委员，设置投票内容、材料和时间。</p>
            </div>
          </article>

          <article className={styles.rolePanel}>
            <ShieldPersonRegular aria-hidden="true" />
            <div>
              <h3>管理员</h3>
              <p>拥有系统全部功能，并负责角色、人员与系统配置的统一管理。</p>
            </div>
          </article>
        </div>
      </section>

      <section className={styles.entrySection} id="entry" aria-labelledby="entry-title">
        <div className={styles.entryIntro}>
          <h2 id="entry-title">投票入口，会主动来到委员身边</h2>
          <p>委员不必记住复杂路径。应用、链接与机器人提醒覆盖主动查找和被动通知两种场景。</p>
        </div>

        <div className={styles.entryList}>
          <article>
            <span className={styles.entryIcon}><SearchRegular aria-hidden="true" /></span>
            <div>
              <h3>在钉钉顶部搜索</h3>
              <p>打开钉钉，在顶部搜索“投票”应用，即可进入自己的投票列表。</p>
            </div>
          </article>
          <article>
            <span className={styles.entryIcon}><LinkRegular aria-hidden="true" /></span>
            <div>
              <h3>通过好友链接进入</h3>
              <p>投票链接可直接发送给钉钉好友，委员点击后完成身份验证并进入对应投票。</p>
            </div>
          </article>
          <article className={styles.botEntry}>
            <span className={styles.entryIcon}><BotRegular aria-hidden="true" /></span>
            <div>
              <h3>接收投票提醒助手私信</h3>
              <p>投票发起后，机器人“投票提醒助手”会私信每位需要投票的委员。</p>
            </div>
          </article>
        </div>
      </section>

      <section className={styles.usageSection} aria-labelledby="usage-title">
        <div className={styles.sectionHeading}>
          <h2 id="usage-title">表达更轻松，规则更明确</h2>
          <p>减少委员填写意见的负担，同时确保委员会调整不会改变已经开始的评审范围。</p>
        </div>

        <div className={styles.usageGrid}>
          <article className={styles.voiceFeature}>
            <span className={styles.featureIcon}><MicRegular aria-hidden="true" /></span>
            <div>
              <h3>语音快速留下意见</h3>
              <p>委员可在意见栏直接录音。系统通过 ASR 自动转成文字，确认后即可提交评论意见。</p>
            </div>
            <strong>说完即可整理成文字</strong>
          </article>

          <article className={styles.committeeRule}>
            <span className={styles.featureIcon}><HistoryRegular aria-hidden="true" /></span>
            <div>
              <h3>委员会变更只影响新投票</h3>
              <p>成员调整仅用于后续新建投票。已经发起的投票无法修改委员范围，但发起人可以手动关闭投票。</p>
            </div>
          </article>
        </div>
      </section>

      <section className={styles.qaSection} id="questions" aria-labelledby="questions-title">
        <div className={styles.qaHeading}>
          <h2 id="questions-title">常见问题</h2>
          <p>关于查看权限、投票修改和发起人停用的说明。</p>
        </div>

        <dl className={styles.qaList}>
          <div>
            <dt>谁可以查看投票结果？</dt>
            <dd>本系统采用记名投票。只有 HR 管理员可以查看统计与投票明细，委员之间不可互相查看。</dd>
          </div>
          <div>
            <dt>提交后还能修改吗？</dt>
            <dd>截止时间前可以修改投票与意见，系统会保留每一次修改记录。</dd>
          </div>
          <div>
            <dt>停用发起人后会怎样？</dt>
            <dd>停用后将无法发起新投票，历史投票仍会保留。</dd>
          </div>
        </dl>
        <div className={styles.auditNote}>
          <EditRegular aria-hidden="true" />
          <span>投票修改有记录，结果查看有边界。</span>
        </div>
      </section>

      <footer className={styles.footer}>
        <span className={styles.brandMark} aria-hidden="true">评</span>
        <p><strong>两委会评审投票</strong><br />让角色、入口和每一张选票都清楚可追溯。</p>
      </footer>
    </main>
  );
}
