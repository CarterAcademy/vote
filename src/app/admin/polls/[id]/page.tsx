import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminPollDetail } from "@/components/admin/AdminPollDetail";
import { getSessionUser } from "@/server/auth/session";
import { buildLoginPath } from "@/lib/auth/return-to";
import { getPollDetail, isDomainError } from "@/server/services";
import { idSchema } from "@/server/validation";

export const metadata: Metadata = { title: "投票详情" };

export default async function AdminPollDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(buildLoginPath(`/admin/polls/${encodeURIComponent(id)}`));
  if (user.role !== "HR") redirect("/vote");
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) notFound();

  try {
    const detail = await getPollDetail(parsedId.data, user);
    if (!("voters" in detail)) redirect("/vote");
    return <AdminPollDetail pollId={parsedId.data} initialDetail={detail} />;
  } catch (error) {
    if (isDomainError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}
