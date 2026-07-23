import { NextRequest, NextResponse } from "next/server";

import { setSessionCookie } from "@/server/auth/session";
import { ensureDatabaseReady } from "@/server/db";
import { normalizeReturnTo } from "@/lib/auth/return-to";
import {
  buildDingTalkPostLoginUrl,
  DINGTALK_WEB_OAUTH_STATE_COOKIE,
  DINGTALK_WEB_RETURN_TO_COOKIE,
  validateDingTalkWebOAuthState,
} from "@/server/dingtalk/web-oauth";
import { authenticateDingTalkWebCode } from "@/server/services/users";

function clearOAuthState(response: NextResponse): NextResponse {
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
}

export async function GET(request: NextRequest) {
  const expectedState = request.cookies.get(DINGTALK_WEB_OAUTH_STATE_COOKIE)?.value;
  const receivedState = request.nextUrl.searchParams.get("state");
  if (!validateDingTalkWebOAuthState(expectedState, receivedState)) {
    return clearOAuthState(
      NextResponse.json(
        { error: { code: "INVALID_OAUTH_STATE", message: "钉钉登录状态已失效，请重新登录" } },
        { status: 400 },
      ),
    );
  }

  const providerError = request.nextUrl.searchParams.get("error");
  const authCode = request.nextUrl.searchParams.get("authCode");
  if (providerError || !authCode) {
    return clearOAuthState(
      NextResponse.json(
        { error: { code: "DINGTALK_LOGIN_CANCELLED", message: "钉钉登录未完成" } },
        { status: 400 },
      ),
    );
  }

  try {
    await ensureDatabaseReady();
    const user = await authenticateDingTalkWebCode(authCode);
    await setSessionCookie(user);
    const returnTo = normalizeReturnTo(
      request.cookies.get(DINGTALK_WEB_RETURN_TO_COOKIE)?.value,
    );
    const postLoginUrl = buildDingTalkPostLoginUrl(
      returnTo ?? (user.role === "HR" ? "/admin" : "/vote"),
    );
    return clearOAuthState(
      NextResponse.redirect(postLoginUrl),
    );
  } catch (error) {
    const diagnostic = error as {
      code?: string;
      details?: unknown;
      message?: string;
    };
    console.error(
      "DingTalk web login failed",
      JSON.stringify({
        code: diagnostic.code,
        message: diagnostic.message,
        details: diagnostic.details,
      }),
    );
    return clearOAuthState(
      NextResponse.json(
        { error: { code: "DINGTALK_LOGIN_FAILED", message: "钉钉身份验证失败，请重新登录" } },
        { status: 401 },
      ),
    );
  }
}
