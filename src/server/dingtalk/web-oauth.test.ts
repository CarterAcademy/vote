import { afterEach, describe, expect, it } from "vitest";

import {
  buildDingTalkPostLoginUrl,
  buildDingTalkWebAuthorizationUrl,
  validateDingTalkWebOAuthState,
} from "./web-oauth";

const originalClientId = process.env.DINGTALK_CLIENT_ID;
const originalRedirectUri = process.env.DINGTALK_WEB_REDIRECT_URI;
const originalInsecureRedirect = process.env.DINGTALK_WEB_ALLOW_INSECURE_REDIRECT;

afterEach(() => {
  if (originalClientId === undefined) delete process.env.DINGTALK_CLIENT_ID;
  else process.env.DINGTALK_CLIENT_ID = originalClientId;
  if (originalRedirectUri === undefined) delete process.env.DINGTALK_WEB_REDIRECT_URI;
  else process.env.DINGTALK_WEB_REDIRECT_URI = originalRedirectUri;
  if (originalInsecureRedirect === undefined) delete process.env.DINGTALK_WEB_ALLOW_INSECURE_REDIRECT;
  else process.env.DINGTALK_WEB_ALLOW_INSECURE_REDIRECT = originalInsecureRedirect;
});

describe("DingTalk web OAuth", () => {
  it("builds the documented browser authorization request", () => {
    process.env.DINGTALK_CLIENT_ID = "ding-client";
    process.env.DINGTALK_WEB_REDIRECT_URI =
      "http://127.0.0.1:3000/api/auth/dingtalk/web/callback";

    const url = buildDingTalkWebAuthorizationUrl("csrf-state");

    expect(url.origin + url.pathname).toBe(
      "https://login.dingtalk.com/oauth2/auth",
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "ding-client",
      redirect_uri:
        "http://127.0.0.1:3000/api/auth/dingtalk/web/callback",
      state: "csrf-state",
      response_type: "code",
      prompt: "consent",
      scope: "openid corpid",
    });
  });

  it("rejects non-loopback insecure redirect URLs", () => {
    process.env.DINGTALK_CLIENT_ID = "ding-client";
    process.env.DINGTALK_WEB_REDIRECT_URI =
      "http://vote.example.com/api/auth/dingtalk/web/callback";

    expect(() => buildDingTalkWebAuthorizationUrl("csrf-state")).toThrow(
      "must use HTTPS except on loopback",
    );
  });

  it("allows a private HTTP callback only with the development override", () => {
    process.env.DINGTALK_CLIENT_ID = "ding-client";
    process.env.DINGTALK_WEB_REDIRECT_URI =
      "http://10.100.80.126:3011/api/auth/dingtalk/web/callback";

    expect(() => buildDingTalkWebAuthorizationUrl("csrf-state")).toThrow(
      "must use HTTPS",
    );

    process.env.DINGTALK_WEB_ALLOW_INSECURE_REDIRECT = "true";
    expect(
      buildDingTalkWebAuthorizationUrl("csrf-state").searchParams.get(
        "redirect_uri",
      ),
    ).toBe("http://10.100.80.126:3011/api/auth/dingtalk/web/callback");
  });

  it("redirects back to the public callback origin after server-side development", () => {
    process.env.DINGTALK_WEB_REDIRECT_URI =
      "http://10.100.80.126:3011/api/auth/dingtalk/web/callback";
    process.env.DINGTALK_WEB_ALLOW_INSECURE_REDIRECT = "true";

    expect(buildDingTalkPostLoginUrl("/admin").toString()).toBe(
      "http://10.100.80.126:3011/admin",
    );
  });

  it("validates OAuth state without accepting missing or changed values", () => {
    expect(validateDingTalkWebOAuthState("same-state", "same-state")).toBe(true);
    expect(validateDingTalkWebOAuthState("same-state", "other-state")).toBe(false);
    expect(validateDingTalkWebOAuthState(undefined, "same-state")).toBe(false);
    expect(validateDingTalkWebOAuthState("same-state", null)).toBe(false);
  });
});
