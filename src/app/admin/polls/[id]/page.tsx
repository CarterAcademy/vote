import type { Metadata } from "next";
import { RoleGate } from "@/components/RoleGate";
import { AdminPollDetail } from "@/components/admin/AdminPollDetail";

export const metadata: Metadata = { title: "投票详情" };

export default function AdminPollDetailPage() {
  return (
    <RoleGate role="HR">
      <AdminPollDetail />
    </RoleGate>
  );
}

