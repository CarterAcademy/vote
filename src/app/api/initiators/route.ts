import { NextRequest } from "next/server";
import { requireHr } from "@/server/auth/session";
import { addInitiator, listInitiators } from "@/server/services";
import { addInitiatorSchema } from "@/server/validation";
import { assertSameOrigin, ok, readJson, routeError } from "../_lib/http";

export async function GET() {
  try {
    const actor = await requireHr();
    return ok({ items: await listInitiators(actor) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const actor = await requireHr();
    const input = addInitiatorSchema.parse(await readJson(request));
    return ok({ initiator: await addInitiator(input, actor) }, 201);
  } catch (error) {
    return routeError(error);
  }
}
