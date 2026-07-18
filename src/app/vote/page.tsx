import type { Metadata } from "next";
import { RoleGate } from "@/components/RoleGate";
import { MemberPollList } from "@/components/member/MemberPollList";

export const metadata: Metadata = { title: "我的投票" };

export default function VoteListPage() {
  return (
    <RoleGate role="MEMBER">
      <MemberPollList />
    </RoleGate>
  );
}

