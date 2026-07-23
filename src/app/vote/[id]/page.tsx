import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MemberVoteForm } from "@/components/member/MemberVoteForm";
import { getSessionUser } from "@/server/auth/session";
import { buildLoginPath } from "@/lib/auth/return-to";
import { getMemberPollDetail, isDomainError } from "@/server/services";
import { idSchema } from "@/server/validation";

export const metadata: Metadata = { title: "提交评审投票" };

export default async function MemberPollPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect(buildLoginPath(`/vote/${encodeURIComponent(id)}`));
  if (user.role !== "MEMBER" && !user.isCommitteeMember) redirect("/admin");
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) notFound();

  try {
    const detail = await getMemberPollDetail(parsedId.data, user);
    return <MemberVoteForm pollId={parsedId.data} initialDetail={detail} />;
  } catch (error) {
    if (
      isDomainError(error) &&
      (error.code === "NOT_FOUND" || error.code === "NOT_ELIGIBLE")
    ) {
      notFound();
    }
    throw error;
  }
}
