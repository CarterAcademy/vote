import { NextRequest } from "next/server";
import { requireHr } from "@/server/auth/session";
import { updateInitiator } from "@/server/services";
import { idSchema, updateInitiatorSchema } from "@/server/validation";
import { assertSameOrigin, ok, readJson, routeError } from "../../_lib/http";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await requireHr();
    const initiatorId = idSchema.parse((await context.params).id);
    const input = updateInitiatorSchema.parse(await readJson(request));
    return ok({ initiator: await updateInitiator(initiatorId, input, actor) });
  } catch (error) {
    return routeError(error);
  }
}
