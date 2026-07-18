import { NextRequest } from "next/server";
import { clearSessionCookie } from "@/server/auth/session";
import { assertSameOrigin, ok, routeError } from "../_lib/http";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await clearSessionCookie();
    return ok({ success: true });
  } catch (error) {
    return routeError(error);
  }
}
