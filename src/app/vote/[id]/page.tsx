import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MemberVoteForm } from "@/components/member/MemberVoteForm";
import { getSessionUser } from "@/server/auth/session";
import { getMemberPollDetail } from "@/server/services";

export const metadata: Metadata = { title: "提交评审投票" };

export default async function MemberPollPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role !== "MEMBER" && !user.isCommitteeMember) redirect("/admin");
  const { id } = await params;
  const detail = await getMemberPollDetail(id, user);
  return <MemberVoteForm pollId={id} initialDetail={detail} />;
}
