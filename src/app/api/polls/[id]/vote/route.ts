import { NextRequest } from "next/server";
import { requireSessionUser } from "@/server/auth/session";
import { ensureDatabaseReady } from "@/server/db";
import { castOrUpdateVote } from "@/server/services";
import { voteSchema } from "@/server/validation";
import { assertSameOrigin, ok, readJson, routeError } from "../../../_lib/http";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    await ensureDatabaseReady();
    const actor = await requireSessionUser();
    const { id } = await context.params;
    const input = voteSchema.parse(await readJson(request));
    return ok({ vote: await castOrUpdateVote(id, input, actor) });
  } catch (error) {
    return routeError(error);
  }
}
