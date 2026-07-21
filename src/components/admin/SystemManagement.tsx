"use client";

import type { Initiator } from "@/lib/client/types";
import { AppShell } from "@/components/AppShell";
import { InitiatorManagement } from "./InitiatorManagement";
import styles from "./SystemManagement.module.css";

export function SystemManagement({ initialInitiators }: { initialInitiators: Initiator[] }) {
  return (
    <AppShell area="admin">
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <h1>系统管理</h1>
          <p>维护发起人权限与系统访问范围。</p>
        </header>
        <InitiatorManagement initialInitiators={initialInitiators} />
      </div>
    </AppShell>
  );
}
