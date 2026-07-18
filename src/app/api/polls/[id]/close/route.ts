import { NextRequest } from "next/server";
import { requireHr } from "@/server/auth/session";
import { ensureDatabaseReady } from "@/server/db";
import { closePoll } from "@/server/services";
import { assertSameOrigin, ok, routeError } from "../../../_lib/http";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    await ensureDatabaseReady();
    const actor = await requireHr();
    const { id } = await context.params;
    return ok({ poll: await closePoll(id, actor) });
  } catch (error) {
    return routeError(error);
  }
}
