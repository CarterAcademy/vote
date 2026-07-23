import { NextRequest, NextResponse } from "next/server";
import { normalizeReturnTo } from "@/lib/auth/return-to";

import {
  buildDingTalkWebAuthorizationUrl,
  createDingTalkWebOAuthState,
  DINGTALK_WEB_OAUTH_STATE_COOKIE,
  DINGTALK_WEB_OAUTH_STATE_MAX_AGE,
  DINGTALK_WEB_RETURN_TO_COOKIE,
  getDingTalkWebRedirectUri,
} from "@/server/dingtalk/web-oauth";

export async function GET(request: NextRequest) {
  const state = createDingTalkWebOAuthState();
  const redirectUri = getDingTalkWebRedirectUri();
  const response = NextResponse.redirect(buildDingTalkWebAuthorizationUrl(state));
  response.cookies.set(DINGTALK_WEB_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: redirectUri.startsWith("https:"),
    path: "/",
    maxAge: DINGTALK_WEB_OAUTH_STATE_MAX_AGE,
  });
  const returnTo = normalizeReturnTo(request.nextUrl.searchParams.get("next"));
  if (returnTo) {
    response.cookies.set(DINGTALK_WEB_RETURN_TO_COOKIE, returnTo, {
      httpOnly: true,
      sameSite: "lax",
      secure: redirectUri.startsWith("https:"),
      path: "/",
      maxAge: DINGTALK_WEB_OAUTH_STATE_MAX_AGE,
    });
  } else {
    response.cookies.set(DINGTALK_WEB_RETURN_TO_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}
