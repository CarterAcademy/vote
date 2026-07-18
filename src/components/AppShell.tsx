"use client";

import {
  Button,
  Tooltip,
} from "@fluentui/react-components";
import {
  ArrowExitRegular,
  HomeRegular,
  PeopleCommunityRegular,
  PeopleTeamRegular,
} from "@fluentui/react-icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { api } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import styles from "./AppShell.module.css";

type ShellArea = "admin" | "member";

interface AppShellProps {
  area: ShellArea;
  children: ReactNode;
}

const adminLinks = [
  { href: "/admin", label: "投票管理", icon: HomeRegular, exact: true },
  { href: "/admin/committees", label: "委员会管理", icon: PeopleCommunityRegular, exact: true },
];

const memberLinks = [
  { href: "/vote", label: "我的投票", icon: PeopleTeamRegular, exact: false },
];

export function AppShell({ area, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, refresh, mockMode } = useSession();
  const links = area === "admin" ? adminLinks : memberLinks;

  async function logout() {
    try {
      await api.logout();
    } finally {
      await refresh();
      router.replace(mockMode ? "/demo" : "/");
      router.refresh();
    }
  }

  function isActive(href: string, exact: boolean) {
    const path = href.split("#")[0];
    return exact ? pathname === path : pathname.startsWith(path);
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href={area === "admin" ? "/admin" : "/vote"} className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">评</span>
            <span className={styles.brandText}>
              <span className={styles.brandTitle}>两委会评审投票</span>
              <span className={styles.brandContext}>
                {area === "admin" ? "HR 管理端" : "委员端"}
              </span>
            </span>
          </Link>
          <div className={styles.headerActions}>
            {user && <span className={styles.userName}>{user.name}</span>}
            <Tooltip content="退出当前账号" relationship="label">
              <Button
                appearance="subtle"
                icon={<ArrowExitRegular />}
                aria-label="退出当前账号"
                onClick={() => void logout()}
              >
                <span className={styles.logoutLabel}>退出</span>
              </Button>
            </Tooltip>
          </div>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.sidebar} aria-label="主导航">
          <nav className={styles.nav}>
            {links.map(({ href, label, icon: Icon, exact }) => {
              const active = isActive(href, exact);
              return (
                <Link
                  href={href}
                  key={href}
                  className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className={styles.content}>{children}</main>
      </div>

      <nav className={styles.mobileNav} aria-label="移动端导航">
        {links.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              href={href}
              key={href}
              className={`${styles.mobileLink} ${active ? styles.mobileLinkActive : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
