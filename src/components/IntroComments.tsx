"use client";

import { Button, Spinner } from "@fluentui/react-components";
import {
  ChatRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  DismissRegular,
  SendRegular,
} from "@fluentui/react-icons";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import type { IntroComment } from "@/lib/client/types";
import { useSession } from "@/lib/client/session";
import { VoiceOpinionInput } from "./member/VoiceOpinionInput";
import styles from "./IntroComments.module.css";

function commentTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function IntroComments() {
  const pathname = usePathname();
  const { user } = useSession();
  const hasMobileNavigation = pathname === "/admin"
    || pathname.startsWith("/admin/")
    || pathname === "/vote"
    || pathname.startsWith("/vote/");
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<IntroComment[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mobileCollapsed, setMobileCollapsed] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const commentsLoadedRef = useRef(false);

  useEffect(() => {
    if (!open || commentsLoadedRef.current) return;
    commentsLoadedRef.current = true;
    setLoading(true);
    setMessage(null);
    void api.introComments()
      .then(setComments)
      .catch((error) => {
        commentsLoadedRef.current = false;
        setMessage(errorMessage(error));
      })
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    if (typeof list.scrollTo === "function") {
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    } else {
      list.scrollTop = list.scrollHeight;
    }
  }, [comments, open]);

  async function submitComment() {
    const normalized = content.trim();
    if (!normalized || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const comment = await api.createIntroComment(normalized);
      setComments((current) => [...current, comment]);
      setContent("");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {open && (
        <aside
          className={`${styles.panel} ${hasMobileNavigation ? styles.aboveMobileNavigation : ""}`}
          aria-label="评论"
        >
          <header className={styles.header}>
            <div>
              <strong>说说你的想法</strong>
              <span>{user ? `将以 ${user.name} 的名字发布` : "未登录，将使用固定的可爱昵称"}</span>
            </div>
            <Button
              appearance="subtle"
              icon={<DismissRegular />}
              aria-label="关闭评论"
              onClick={() => setOpen(false)}
            />
          </header>

          <div className={styles.list} ref={listRef} aria-live="polite">
            {loading ? (
              <div className={styles.state}><Spinner size="tiny" label="正在加载评论" /></div>
            ) : comments.length === 0 ? (
              <div className={styles.empty}>
                <ChatRegular aria-hidden="true" />
                <strong>还没有评论</strong>
                <span>来留下第一个想法吧。</span>
              </div>
            ) : comments.map((comment) => (
              <article className={styles.comment} key={comment.id}>
                <div className={styles.commentMeta}>
                  <strong>{comment.authorName}</strong>
                  {comment.anonymous && <span className={styles.anonymousTag}>访客</span>}
                  <time dateTime={comment.createdAt}>{commentTime(comment.createdAt)}</time>
                </div>
                <p>{comment.content}</p>
              </article>
            ))}
          </div>

          <div className={styles.composer}>
            <VoiceOpinionInput
              value={content}
              onChange={setContent}
              maxLength={1000}
              placeholder="输入评论，或点麦克风用语音输入"
              ariaLabel="评论内容"
            />
            {message && <p className={styles.message} role="alert">{message}</p>}
            <Button
              appearance="primary"
              icon={<SendRegular />}
              disabled={!content.trim() || submitting}
              onClick={() => void submitComment()}
              className={styles.submit}
            >
              {submitting ? "发布中" : "发布评论"}
            </Button>
          </div>
        </aside>
      )}

      {!open && (
        <div
          className={`${styles.floatingControls} ${mobileCollapsed ? styles.floatingControlsCollapsed : ""} ${hasMobileNavigation ? styles.aboveMobileNavigation : ""}`}
        >
          <button
            type="button"
            className={styles.floatingButton}
            aria-label="打开评论"
            aria-expanded="false"
            onClick={() => setOpen(true)}
          >
            <ChatRegular aria-hidden="true" />
            <span>评论</span>
          </button>
          <button
            type="button"
            className={styles.collapseButton}
            aria-label="将评论按钮收起到右侧"
            onClick={() => setMobileCollapsed(true)}
          >
            <ChevronRightRegular aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.expandButton}
            aria-label="展开评论按钮"
            onClick={() => setMobileCollapsed(false)}
          >
            <ChevronLeftRegular aria-hidden="true" />
            <ChatRegular aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}
