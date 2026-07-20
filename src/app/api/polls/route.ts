import { NextRequest } from "next/server";
import { requireHr, requireSessionUser } from "@/server/auth/session";
import { ensureDatabaseReady } from "@/server/db";
import { createPoll, listPolls } from "@/server/services";
import { createPollSchema, pollListQuerySchema } from "@/server/validation";
import { assertSameOrigin, ok, readJson, routeError } from "../_lib/http";

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseReady();
    const actor = await requireSessionUser();
    const query = pollListQuerySchema.parse({
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      search: request.nextUrl.searchParams.get("q") ?? undefined,
      committeeId: request.nextUrl.searchParams.get("committeeId") ?? undefined,
      from: request.nextUrl.searchParams.get("from") ?? undefined,
      to: request.nextUrl.searchParams.get("to") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined,
      scope: request.nextUrl.searchParams.get("scope") ?? undefined,
    });
    const result = await listPolls(query, actor);
    return ok(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await ensureDatabaseReady();
    const actor = await requireHr();
    const input = createPollSchema.parse(await readJson(request));
    return ok({ poll: await createPoll(input, actor) }, 201);
  } catch (error) {
    return routeError(error);
  }
}
