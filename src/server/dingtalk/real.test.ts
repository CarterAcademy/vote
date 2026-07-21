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

describe("RealDingTalkGateway directory", () => {
  it("lists child departments and a page of department users", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "app-token", expireIn: 7200 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          errcode: 0,
          result: [{ dept_id: 42, name: "研发中心", parent_id: 1 }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          errcode: 0,
          result: {
            has_more: true,
            next_cursor: 100,
            list: [{ userid: "user-1", name: "测试用户", title: "研究员" }],
          },
        }),
      );
    const gateway = new RealDingTalkGateway({
      appKey: "client-id",
      appSecret: "client-secret",
      fetchImpl,
    });

    await expect(gateway.listDirectory(1)).resolves.toEqual({
      departments: [{ id: "42", name: "研发中心", parentId: "1" }],
      users: [{ userId: "user-1", name: "测试用户", title: "研究员" }],
      hasMore: true,
      nextCursor: 100,
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://oapi.dingtalk.com/topapi/v2/department/listsub?access_token=app-token",
      expect.objectContaining({ body: JSON.stringify({ dept_id: 1 }) }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "https://oapi.dingtalk.com/topapi/v2/user/list?access_token=app-token",
      expect.objectContaining({
        body: JSON.stringify({
          dept_id: 1,
          cursor: 0,
          size: 100,
          contain_access_limit: false,
        }),
      }),
    );
  });

  it("rejects unsuccessful directory responses", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "app-token", expireIn: 7200 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ errcode: 60011, errmsg: "no permission", result: [] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ errcode: 0, result: { has_more: false, list: [] } }),
      );
    const gateway = new RealDingTalkGateway({
      appKey: "client-id",
      appSecret: "client-secret",
      fetchImpl,
    });

    await expect(gateway.listDirectory(1)).rejects.toThrow(
      "DingTalk department lookup failed: no permission",
    );
  });

  it("searches the enterprise directory and resolves matching user IDs", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "app-token", expireIn: 7200 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          hasMore: true,
          totalCount: 3,
          list: ["user-2", "user-1"],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          userList: [
            { userid: "user-1", name: "张三" },
            { userid: "user-2", nickname: "张老师" },
          ],
          unauthorizedUserIdList: [],
        }),
      );
    const gateway = new RealDingTalkGateway({
      appKey: "client-id",
      appSecret: "client-secret",
      fetchImpl,
    });

    await expect(gateway.searchDirectoryUsers("张", 20, 10)).resolves.toEqual({
      departments: [],
      users: [
        { userId: "user-2", name: "张老师" },
        { userId: "user-1", name: "张三" },
      ],
      hasMore: true,
      nextCursor: 30,
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://api.dingtalk.com/v1.0/contact/users/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-acs-dingtalk-access-token": "app-token",
        }),
        body: JSON.stringify({ queryWord: "张", offset: 20, size: 10 }),
      }),
    );
    const detailUrl = fetchImpl.mock.calls[2]?.[0];
    expect(detailUrl).toBeInstanceOf(URL);
    expect((detailUrl as URL).pathname).toBe("/v1.0/contact/users/batch/get");
    expect((detailUrl as URL).searchParams.get("userIdList")).toBe(
      JSON.stringify(["user-2", "user-1"]),
    );
  });
});
