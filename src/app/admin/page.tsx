import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { getSessionUser } from "@/server/auth/session";
import { listCommittees, listPolls } from "@/server/services";

export const metadata: Metadata = { title: "投票管理" };

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role !== "HR") redirect("/vote");
  const [polls, committees] = await Promise.all([
    listPolls({}, user),
    listCommittees(),
  ]);
  return <AdminOverview initialPolls={polls} initialCommittees={committees} />;
}
