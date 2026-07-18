"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/client/session";
import { DingTalkAuthBootstrap } from "@/components/auth/DingTalkAuthBootstrap";
import { ErrorState, PageLoading } from "@/components/PageState";

export function SessionRouter() {
  const router = useRouter();
  const { user, mockMode, loading, error, refresh } = useSession();

  useEffect(() => {
    if (loading || error) return;
    if (user) {
      router.replace(user.role === "HR" ? "/admin" : "/vote");
    } else if (mockMode) {
      router.replace("/demo");
    }
  }, [error, loading, mockMode, router, user]);

  if (loading || user || mockMode) return <PageLoading label="正在确认身份" />;
  if (error) {
    return (
      <ErrorState
        title="身份验证服务暂不可用"
        description={error}
        onRetry={() => void refresh()}
      />
    );
  }

  return <DingTalkAuthBootstrap />;
}

