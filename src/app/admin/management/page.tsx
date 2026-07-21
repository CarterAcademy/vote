import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SystemManagement } from "@/components/admin/SystemManagement";
import { getSessionUser } from "@/server/auth/session";
import { listInitiators } from "@/server/services";

export const metadata: Metadata = { title: "系统管理" };

export default async function ManagementPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.role !== "HR") redirect("/vote");
  const initiators = await listInitiators(user);
  return <SystemManagement initialInitiators={initiators} />;
}
