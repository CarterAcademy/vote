import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { getSessionUser } from "@/server/auth/session";
import { getPollDashboardStats, listCommittees, listPolls } from "@/server/services";

export const metadata: Metadata = { title: "投票管理" };

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role !== "HR") redirect("/vote");
  const [polls, committees, dashboardStats] = await Promise.all([
    listPolls({ scope: "OWN" }, user),
    listCommittees(),
    getPollDashboardStats(user, "OWN"),
  ]);
  return <AdminOverview initialPolls={polls} initialCommittees={committees} initialDashboardStats={dashboardStats} />;
}
