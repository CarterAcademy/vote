import { redirect } from "next/navigation";
import { DingTalkAuthBootstrap } from "@/components/auth/DingTalkAuthBootstrap";
import { getSessionUser } from "@/server/auth/session";
import { isMockModeEnabled } from "@/server/dingtalk";

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect(user.role === "HR" ? "/admin" : "/vote");
  if (isMockModeEnabled()) redirect("/demo");
  return <DingTalkAuthBootstrap />;
}
