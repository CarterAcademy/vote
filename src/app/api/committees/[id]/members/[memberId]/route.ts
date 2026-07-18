import { NextRequest } from "next/server";
import { requireHr } from "@/server/auth/session";
import { removeCommitteeMember } from "@/server/services";
import { idSchema } from "@/server/validation";
import { assertSameOrigin, ok, routeError } from "../../../../_lib/http";

interface RouteContext {
  params: Promise<{ id: string; memberId: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await requireHr();
    const params = await context.params;
    await removeCommitteeMember(idSchema.parse(params.id), idSchema.parse(params.memberId), actor);
    return ok({ success: true });
  } catch (error) {
    return routeError(error);
  }
}
