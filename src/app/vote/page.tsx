import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MemberPollList } from "@/components/member/MemberPollList";
import { getSessionUser } from "@/server/auth/session";
import { buildLoginPath } from "@/lib/auth/return-to";
import { listPolls } from "@/server/services";

export const metadata: Metadata = { title: "我的投票" };

export default async function VoteListPage({
  searchParams,
}: {
  searchParams: Promise<{ completed?: string }>;
}) {
  const query = await searchParams;
  const returnTo = query.completed === "1" ? "/vote?completed=1" : "/vote";
  const user = await getSessionUser();
  if (!user) redirect(buildLoginPath(returnTo));
  if (user.role !== "MEMBER" && !user.isCommitteeMember) redirect("/admin");
  const polls = await listPolls({ pageSize: 100, scope: "ELIGIBLE" }, user);
  return <MemberPollList initialPolls={polls.items} completedNow={query.completed === "1"} />;
}
