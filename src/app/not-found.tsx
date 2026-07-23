import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getSessionUser } from "@/server/auth/session";
import styles from "./not-found.module.css";

export const metadata: Metadata = { title: "页面不存在" };

function NotFoundContent({
  destination,
  destinationLabel,
}: {
  destination: string;
  destinationLabel: string;
}) {
  return (
    <section className={styles.card} aria-labelledby="not-found-title">
      <span className={styles.mark} aria-hidden="true">评</span>
      <p className={styles.eyebrow}>404 · 页面不存在</p>
      <h1 id="not-found-title">没有找到这个页面</h1>
      <p>链接可能已失效，或对应的投票记录已被移除。你可以返回系统继续处理其他事项。</p>
      <div className={styles.actions}>
        <Link className={styles.primary} href={destination}>{destinationLabel}</Link>
        <Link className={styles.secondary} href="/intro">查看系统介绍</Link>
      </div>
    </section>
  );
}

export default async function NotFoundPage() {
  const user = await getSessionUser();

  if (user) {
    const isAdmin = user.role === "HR";
    return (
      <AppShell area={isAdmin ? "admin" : "member"}>
        <div className={styles.embedded}>
          <NotFoundContent
            destination={isAdmin ? "/admin" : "/vote"}
            destinationLabel={isAdmin ? "返回投票管理" : "返回我的投票"}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <main className={styles.page}>
      <NotFoundContent destination="/" destinationLabel="返回首页" />
    </main>
  );
}
