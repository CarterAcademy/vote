import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { setSessionCookie } from "@/server/auth/session";
import { ensureDatabaseReady } from "@/server/db";
import {
  DINGTALK_WEB_OAUTH_STATE_COOKIE,
  DINGTALK_WEB_RETURN_TO_COOKIE,
  validateDingTalkWebOAuthState,
} from "@/server/dingtalk/web-oauth";
import { authenticateDingTalkWebCode } from "@/server/services/users";
import { assertSameOrigin, ok, readJson, routeError } from "../../../../_lib/http";

const completeSchema = z.object({
  authCode: z.string().trim().min(1).max(2048),
  state: z.string().trim().min(1).max(256),
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const expectedState = request.cookies.get(DINGTALK_WEB_OAUTH_STATE_COOKIE)?.value;
    const { authCode, state } = completeSchema.parse(await readJson(request));
    if (!validateDingTalkWebOAuthState(expectedState, state)) {
      return NextResponse.json(
        { error: { code: "INVALID_OAUTH_STATE", message: "钉钉登录状态已失效，请重新登录" } },
        { status: 400 },
      );
    }

    await ensureDatabaseReady();
    const user = await authenticateDingTalkWebCode(authCode);
    await setSessionCookie(user);
    const response = ok({ user, mockMode: false });
    response.cookies.set(DINGTALK_WEB_OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    response.cookies.set(DINGTALK_WEB_RETURN_TO_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return routeError(error);
  }
}
