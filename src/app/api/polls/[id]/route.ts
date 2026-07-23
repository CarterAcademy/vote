import { requireSessionUser } from "@/server/auth/session";
import { ensureDatabaseReady } from "@/server/db";
import { getMemberPollDetail, getPollDetail } from "@/server/services";
import { DomainError } from "@/server/services/errors";
import { idSchema } from "@/server/validation";
import { ok, routeError } from "../../_lib/http";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureDatabaseReady();
    const actor = await requireSessionUser();
    const parsedId = idSchema.safeParse((await context.params).id);
    if (!parsedId.success) throw new DomainError("NOT_FOUND", "投票不存在");
    const id = parsedId.data;
    const memberView = new URL(request.url).searchParams.get("view") === "member";
    if (memberView) {
      if (actor.role !== "MEMBER" && !actor.isCommitteeMember) {
        throw new DomainError("FORBIDDEN", "仅委员会成员可以查看自己的投票");
      }
      return ok(await getMemberPollDetail(id, actor));
    }
    return ok(await getPollDetail(id, actor));
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_ELIGIBLE") {
      return routeError(new DomainError("NOT_FOUND", "投票不存在"));
    }
    return routeError(error);
  }
}
