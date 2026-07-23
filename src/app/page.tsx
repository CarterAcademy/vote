import { redirect } from "next/navigation";
import { DingTalkAuthBootstrap } from "@/components/auth/DingTalkAuthBootstrap";
import { getSessionUser } from "@/server/auth/session";
import { isMockModeEnabled } from "@/server/dingtalk";
import { normalizeReturnTo } from "@/lib/auth/return-to";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const requestedNext = (await searchParams).next;
  const returnTo = normalizeReturnTo(
    typeof requestedNext === "string" ? requestedNext : undefined,
  );
  const user = await getSessionUser();
  if (user) redirect(returnTo ?? (user.role === "HR" ? "/admin" : "/vote"));
  if (isMockModeEnabled()) redirect("/demo");
  return <DingTalkAuthBootstrap returnTo={returnTo} />;
}
