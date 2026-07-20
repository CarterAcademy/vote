import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { getSessionUser } from "@/server/auth/session";
import {
  getPollDashboardStats,
  listCommittees,
  listInitiators,
  listPolls,
} from "@/server/services";

export const metadata: Metadata = { title: "系统管理" };

export default async function ManagementPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role !== "HR") redirect("/vote");
  const [polls, committees, initiators, dashboardStats] = await Promise.all([
    listPolls({ scope: "ALL" }, user),
    listCommittees(),
    listInitiators(user),
    getPollDashboardStats(user, "ALL"),
  ]);
  return (
    <AdminOverview
      initialPolls={polls}
      initialCommittees={committees}
      initialInitiators={initiators}
      initialDashboardStats={dashboardStats}
      scope="ALL"
    />
  );
}
