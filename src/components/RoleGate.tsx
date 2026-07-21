"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/client/types";
import { useSession } from "@/lib/client/session";
import { ErrorState, PageLoading } from "./PageState";

export function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const router = useRouter();
  const { user, loading, error, refresh } = useSession();

  useEffect(() => {
    if (loading || error) return;
    if (!user) router.replace("/");
    else if (role === "HR" ? user.role !== "HR" : user.role !== "MEMBER" && !user.isCommitteeMember) {
      router.replace(user.role === "HR" ? "/admin" : "/vote");
    }
  }, [error, loading, role, router, user]);

  if (error) {
    return <ErrorState description={error} onRetry={() => void refresh()} />;
  }
  const permitted = user && (role === "HR" ? user.role === "HR" : user.role === "MEMBER" || user.isCommitteeMember);
  if (loading || !permitted) return <PageLoading label="正在检查访问权限" />;
  return children;
}
