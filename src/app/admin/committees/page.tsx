import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CommitteeManagement } from "@/components/admin/CommitteeManagement";
import { getSessionUser } from "@/server/auth/session";
import { listCommitteeMembers, listCommittees } from "@/server/services";

export const metadata: Metadata = { title: "委员会管理" };

export default async function CommitteeManagementPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role !== "HR") redirect("/vote");
  const committees = await listCommittees();
  const memberEntries = await Promise.all(
    committees.map(async (committee) => [
      committee.id,
      await listCommitteeMembers(committee.id),
    ] as const),
  );
  return (
    <CommitteeManagement
      initialCommittees={committees}
      initialMembersByCommittee={Object.fromEntries(memberEntries)}
    />
  );
}
