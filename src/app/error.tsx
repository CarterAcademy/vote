"use client";

import Link from "next/link";
import { useEffect } from "react";
import styles from "./not-found.module.css";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("页面渲染失败", error);
  }, [error]);

  return (
    <main className={styles.page}>
      <section className={styles.card} role="alert" aria-labelledby="page-error-title">
        <span className={styles.mark} aria-hidden="true">评</span>
        <p className={styles.eyebrow}>页面暂时不可用</p>
        <h1 id="page-error-title">这次没有加载成功</h1>
        <p>系统没有展示内部错误信息。请重新尝试；如果问题持续存在，可以先返回投票列表。</p>
        <div className={styles.actions}>
          <button className={styles.primary} type="button" onClick={reset}>重新加载</button>
          <Link className={styles.secondary} href="/">返回首页</Link>
        </div>
      </section>
    </main>
  );
}
