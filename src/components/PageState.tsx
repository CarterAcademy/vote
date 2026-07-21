"use client";

import {
  Button,
  Skeleton,
  SkeletonItem,
} from "@fluentui/react-components";
import {
  BoxRegular,
  ErrorCircleRegular,
} from "@fluentui/react-icons";
import styles from "./PageState.module.css";

export function PageLoading({ label = "正在加载" }: { label?: string }) {
  return (
    <div className={styles.state} aria-busy="true" aria-label={label}>
      <Skeleton className={styles.skeleton}>
        <div className={styles.skeletonHeader}>
          <SkeletonItem size={28} style={{ width: "38%" }} />
          <SkeletonItem size={32} style={{ width: 96 }} />
        </div>
        {[0, 1, 2].map((item) => (
          <div className={styles.skeletonRow} key={item}>
            <SkeletonItem size={20} style={{ width: `${54 + item * 8}%` }} />
            <SkeletonItem size={14} style={{ width: "82%" }} />
            <SkeletonItem size={14} style={{ width: "45%" }} />
          </div>
        ))}
      </Skeleton>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  align = "center",
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div className={`${styles.state} ${styles.stateCompact} ${align === "left" ? styles.stateLeft : ""}`}>
      <span className={styles.iconFrame} aria-hidden="true"><BoxRegular /></span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "内容加载失败",
  description,
  onRetry,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div className={`${styles.state} ${styles.stateCompact}`} role="alert">
      <span className={styles.iconFrame} aria-hidden="true"><ErrorCircleRegular /></span>
      <h2>{title}</h2>
      <p>{description}</p>
      {onRetry && <Button appearance="primary" onClick={onRetry}>重新加载</Button>}
    </div>
  );
}
