import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminPollDetail } from "@/components/admin/AdminPollDetail";
import { getSessionUser } from "@/server/auth/session";
import { getPollDetail } from "@/server/services";

export const metadata: Metadata = { title: "投票详情" };

export default async function AdminPollDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role !== "HR") redirect("/vote");
  const { id } = await params;
  const detail = await getPollDetail(id, user);
  if (!("voters" in detail)) redirect("/vote");
  return <AdminPollDetail pollId={id} initialDetail={detail} />;
}
