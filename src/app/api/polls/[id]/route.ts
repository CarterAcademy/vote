import { requireSessionUser } from "@/server/auth/session";
import { ensureDatabaseReady } from "@/server/db";
import { getPollDetail } from "@/server/services";
import { ok, routeError } from "../../_lib/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureDatabaseReady();
    const actor = await requireSessionUser();
    const { id } = await context.params;
    return ok(await getPollDetail(id, actor));
  } catch (error) {
    return routeError(error);
  }
}
