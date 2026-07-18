import { NextRequest } from "next/server";
import { requireHr } from "@/server/auth/session";
import { addCommitteeMember, listCommitteeMembers } from "@/server/services";
import { idSchema } from "@/server/validation";
import { assertSameOrigin, ok, readJson, routeError } from "../../../_lib/http";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireHr();
    const committeeId = idSchema.parse((await context.params).id);
    return ok({ items: await listCommitteeMembers(committeeId) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await requireHr();
    const committeeId = idSchema.parse((await context.params).id);
    const member = await addCommitteeMember(committeeId, await readJson(request), actor);
    return ok({ member }, 201);
  } catch (error) {
    return routeError(error);
  }
}
