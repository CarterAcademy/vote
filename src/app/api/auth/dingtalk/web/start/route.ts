import { NextResponse } from "next/server";

import {
  buildDingTalkWebAuthorizationUrl,
  createDingTalkWebOAuthState,
  DINGTALK_WEB_OAUTH_STATE_COOKIE,
  DINGTALK_WEB_OAUTH_STATE_MAX_AGE,
  getDingTalkWebRedirectUri,
} from "@/server/dingtalk/web-oauth";

export async function GET() {
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
  return response;
}
