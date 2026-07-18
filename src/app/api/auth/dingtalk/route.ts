import { NextRequest } from "next/server";
import { z } from "zod";
import { setSessionCookie } from "@/server/auth/session";
import { ensureDatabaseReady } from "@/server/db";
import { authenticateDingTalkCode } from "@/server/services/users";
import { assertSameOrigin, ok, readJson, routeError } from "../../_lib/http";

const authSchema = z.object({ authCode: z.string().trim().min(1).max(2048) });

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await ensureDatabaseReady();
    const { authCode } = authSchema.parse(await readJson(request));
    const user = await authenticateDingTalkCode(authCode);
    await setSessionCookie(user);
    return ok({ user, mockMode: false });
  } catch (error) {
    return routeError(error);
  }
}
