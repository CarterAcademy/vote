import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MemberPollList } from "@/components/member/MemberPollList";
import { getSessionUser } from "@/server/auth/session";
import { listPolls } from "@/server/services";

export const metadata: Metadata = { title: "我的投票" };

export default async function VoteListPage({
  searchParams,
}: {
  searchParams: Promise<{ completed?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role !== "MEMBER" && !user.isCommitteeMember) redirect("/admin");
  const query = await searchParams;
  const polls = await listPolls({ pageSize: 100, scope: "ELIGIBLE" }, user);
  return <MemberPollList initialPolls={polls.items} completedNow={query.completed === "1"} />;
}
