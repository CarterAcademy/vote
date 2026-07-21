import { NextRequest } from "next/server";
import { requireHr } from "@/server/auth/session";
import { deleteCommittee, updateCommittee } from "@/server/services";
import { idSchema, updateCommitteeSchema } from "@/server/validation";
import { assertSameOrigin, ok, readJson, routeError } from "../../_lib/http";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await requireHr();
    const committeeId = idSchema.parse((await context.params).id);
    const input = updateCommitteeSchema.parse(await readJson(request));
    return ok({ committee: await updateCommittee(committeeId, input, actor) });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await requireHr();
    const committeeId = idSchema.parse((await context.params).id);
    await deleteCommittee(committeeId, actor);
    return ok({ success: true });
  } catch (error) {
    return routeError(error);
  }
}
