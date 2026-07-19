import { redirect } from "next/navigation";
import { DingTalkAuthBootstrap } from "@/components/auth/DingTalkAuthBootstrap";
import { getSessionUser } from "@/server/auth/session";

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect(user.role === "HR" ? "/admin" : "/vote");
  if (
    process.env.DINGTALK_MOCK_ENABLED === "true" &&
    process.env.NODE_ENV !== "production"
  ) {
    redirect("/demo");
  }
  return <DingTalkAuthBootstrap />;
}
