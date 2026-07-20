import { describe, expect, it, vi } from "vitest";

import { RealDingTalkGateway } from "./real";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("RealDingTalkGateway web login", () => {
  it("exchanges the delegated union ID for the corporate user ID", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          accessToken: "delegated-token",
          expireIn: 7200,
          corpId: "corp-1",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ nick: "测试用户", unionId: "union-1", openId: "open-1" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "app-token", expireIn: 7200 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ errcode: 0, result: { userid: "user-1" } }),
      );
    const gateway = new RealDingTalkGateway({
      appKey: "client-id",
      appSecret: "client-secret",
      corpId: "corp-1",
      fetchImpl,
    });

    await expect(gateway.exchangeWebAuthCode("auth-code")).resolves.toEqual({
      userId: "user-1",
      name: "测试用户",
      unionId: "union-1",
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://api.dingtalk.com/v1.0/oauth2/userAccessToken",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          clientId: "client-id",
          clientSecret: "client-secret",
          code: "auth-code",
          grantType: "authorization_code",
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://api.dingtalk.com/v1.0/contact/users/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-acs-dingtalk-access-token": "delegated-token",
        }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      "https://oapi.dingtalk.com/topapi/user/getbyunionid?access_token=app-token",
      expect.objectContaining({ body: JSON.stringify({ unionid: "union-1" }) }),
    );
  });

  it("rejects a login for another organization", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "delegated-token", corpId: "corp-other" }),
      );
    const gateway = new RealDingTalkGateway({
      appKey: "client-id",
      appSecret: "client-secret",
      corpId: "corp-expected",
      fetchImpl,
    });

    await expect(gateway.exchangeWebAuthCode("auth-code")).rejects.toThrow(
      "unexpected organization",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
