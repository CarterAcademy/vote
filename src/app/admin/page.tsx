import type { Metadata } from "next";
import { RoleGate } from "@/components/RoleGate";
import { AdminOverview } from "@/components/admin/AdminOverview";

export const metadata: Metadata = { title: "投票管理" };

export default function AdminPage() {
  return (
    <RoleGate role="HR">
      <AdminOverview />
    </RoleGate>
  );
}

