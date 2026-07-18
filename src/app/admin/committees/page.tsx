import type { Metadata } from "next";
import { RoleGate } from "@/components/RoleGate";
import { CommitteeManagement } from "@/components/admin/CommitteeManagement";

export const metadata: Metadata = { title: "委员会管理" };

export default function CommitteeManagementPage() {
  return (
    <RoleGate role="HR">
      <CommitteeManagement />
    </RoleGate>
  );
}
