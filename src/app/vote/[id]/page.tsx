import type { Metadata } from "next";
import { RoleGate } from "@/components/RoleGate";
import { MemberVoteForm } from "@/components/member/MemberVoteForm";

export const metadata: Metadata = { title: "提交评审投票" };

export default function MemberPollPage() {
  return (
    <RoleGate role="MEMBER">
      <MemberVoteForm />
    </RoleGate>
  );
}

