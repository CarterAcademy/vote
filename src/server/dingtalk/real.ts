import type {
  DingTalkDirectoryPage,
  DingTalkGateway,
  DingTalkIdentity,
  DirectReminderInput,
  ReminderDelivery,
} from "./gateway";

interface AccessTokenResponse {
  accessToken?: string;
  expireIn?: number;
  code?: string;
  message?: string;
}

interface UserInfoResponse {
  errcode?: number;
  errmsg?: string;
  result?: {
    userid?: string;
    name?: string;
    unionid?: string;
  };
}

interface UserDetailResponse {
  errcode?: number;
  errmsg?: string;
  result?: {
    userid?: string;
    name?: string;
    unionid?: string;
    title?: string;
    dept_id_list?: number[];
  };
}

interface UserAccessTokenResponse {
  accessToken?: string;
  corpId?: string;
  code?: string;
  message?: string;
}

interface DelegatedUserInfoResponse {
  nick?: string;
  unionId?: string;
  openId?: string;
  code?: string;
  message?: string;
}

interface UserByUnionIdResponse {
  errcode?: number;
  errmsg?: string;
  result?: {
    userid?: string;
  };
}

interface RobotResponse {
  processQueryKey?: string;
  code?: string;
  message?: string;
  requestId?: string;
}

interface DepartmentListResponse {
  errcode?: number;
  errmsg?: string;
  result?: Array<{
    dept_id?: number;
    name?: string;
    parent_id?: number;
  }>;
}

interface DepartmentDetailResponse {
  errcode?: number;
  errmsg?: string;
  result?: {
    dept_id?: number;
    name?: string;
  };
}

interface DepartmentUserListResponse {
  errcode?: number;
  errmsg?: string;
  result?: {
    has_more?: boolean;
    next_cursor?: number;
    list?: Array<{
      userid?: string;
      name?: string;
      title?: string;
    }>;
  };
}

interface UserSearchResponse {
  hasMore?: boolean;
  list?: string[];
  totalCount?: number;
  code?: string;
  message?: string;
}

interface BatchUserResponse {
  userList?: Array<{
    userid?: string;
    name?: string;
    nickname?: string;
    title?: string;
    deptIdList?: number[];
  }>;
  unauthorizedUserIdList?: string[];
  code?: string;
  message?: string;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

export interface RealDingTalkOptions {
  appKey: string;
  appSecret: string;
  corpId?: string;
  robotCode?: string;
  apiBaseUrl?: string;
  legacyApiBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class RealDingTalkGateway implements DingTalkGateway {
  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly corpId?: string;
  private readonly robotCode: string;
  private readonly apiBaseUrl: string;
  private readonly legacyApiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private cachedToken?: CachedToken;

  constructor(options: RealDingTalkOptions) {
    this.appKey = options.appKey;
    this.appSecret = options.appSecret;
    this.corpId = options.corpId;
    this.robotCode = options.robotCode ?? options.appKey;
    this.apiBaseUrl = options.apiBaseUrl ?? "https://api.dingtalk.com";
    this.legacyApiBaseUrl =
      options.legacyApiBaseUrl ?? "https://oapi.dingtalk.com";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async exchangeAuthCode(authCode: string): Promise<DingTalkIdentity> {
    const token = await this.getAccessToken();
    const response = await this.fetchImpl(
      `${this.legacyApiBaseUrl}/topapi/v2/user/getuserinfo?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: authCode }),
        cache: "no-store",
      },
    );
    const payload = (await response.json()) as UserInfoResponse;
    if (!response.ok || payload.errcode !== 0 || !payload.result?.userid) {
      throw new Error(
        `DingTalk auth-code exchange failed: ${payload.errmsg ?? response.statusText}`,
      );
    }

    const directoryUser = await this.getDirectoryUser(payload.result.userid);
    return {
      userId: payload.result.userid,
      name: directoryUser?.name ?? payload.result.name,
      unionId: payload.result.unionid,
      ...(directoryUser?.department
        ? { department: directoryUser.department }
        : {}),
    };
  }

  async exchangeWebAuthCode(authCode: string): Promise<DingTalkIdentity> {
    const tokenResponse = await this.fetchImpl(
      `${this.apiBaseUrl}/v1.0/oauth2/userAccessToken`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: this.appKey,
          clientSecret: this.appSecret,
          code: authCode,
          grantType: "authorization_code",
        }),
        cache: "no-store",
      },
    );
    const tokenPayload = (await tokenResponse.json()) as UserAccessTokenResponse;
    if (!tokenResponse.ok || !tokenPayload.accessToken) {
      throw new Error(
        `DingTalk user-token exchange failed: ${tokenPayload.message ?? tokenResponse.statusText}`,
      );
    }
    if (this.corpId && tokenPayload.corpId && tokenPayload.corpId !== this.corpId) {
      throw new Error("DingTalk login selected an unexpected organization");
    }

    const profileResponse = await this.fetchImpl(
      `${this.apiBaseUrl}/v1.0/contact/users/me`,
      {
        method: "GET",
        headers: {
          "content-type": "application/json",
          "x-acs-dingtalk-access-token": tokenPayload.accessToken,
        },
        cache: "no-store",
      },
    );
    const profile = (await profileResponse.json()) as DelegatedUserInfoResponse;
    if (!profileResponse.ok || !profile.unionId) {
      throw new Error(
        `DingTalk delegated user lookup failed: ${profile.message ?? profileResponse.statusText}`,
      );
    }

    const appToken = await this.getAccessToken();
    const userResponse = await this.fetchImpl(
      `${this.legacyApiBaseUrl}/topapi/user/getbyunionid?access_token=${encodeURIComponent(appToken)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unionid: profile.unionId }),
        cache: "no-store",
      },
    );
    const userPayload = (await userResponse.json()) as UserByUnionIdResponse;
    if (!userResponse.ok || userPayload.errcode !== 0 || !userPayload.result?.userid) {
      throw new Error(
        `DingTalk union-id exchange failed: ${userPayload.errmsg ?? userResponse.statusText}`,
      );
    }

    const directoryUser = await this.getDirectoryUser(userPayload.result.userid);
    return {
      userId: userPayload.result.userid,
      name: directoryUser?.name ?? profile.nick,
      unionId: profile.unionId,
      ...(directoryUser?.department
        ? { department: directoryUser.department }
        : {}),
    };
  }

  async getDirectoryUser(userId: string) {
    const token = await this.getAccessToken();
    const response = await this.fetchImpl(
      `${this.legacyApiBaseUrl}/topapi/v2/user/get?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userid: userId }),
        cache: "no-store",
      },
    );
    const payload = (await response.json()) as UserDetailResponse;
    if (!response.ok || payload.errcode !== 0) {
      throw new Error(
        `DingTalk user detail lookup failed: ${payload.errmsg ?? response.statusText}`,
      );
    }
    const user = payload.result;
    if (!user?.userid || !user.name) return null;
    const departments = await this.resolveDepartmentNames(
      token,
      user.dept_id_list ?? [],
    );
    return {
      userId: user.userid,
      name: user.name,
      ...(user.title ? { title: user.title } : {}),
      ...(departments.length > 0
        ? { department: departments.join(" / ") }
        : {}),
    };
  }

  async listDirectory(
    departmentId: number,
    cursor = 0,
    size = 100,
  ): Promise<DingTalkDirectoryPage> {
    const token = await this.getAccessToken();
    const query = `access_token=${encodeURIComponent(token)}`;
    const [departmentResponse, userResponse] = await Promise.all([
      this.fetchImpl(
        `${this.legacyApiBaseUrl}/topapi/v2/department/listsub?${query}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ dept_id: departmentId }),
          cache: "no-store",
        },
      ),
      this.fetchImpl(
        `${this.legacyApiBaseUrl}/topapi/v2/user/list?${query}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            dept_id: departmentId,
            cursor,
            size: Math.min(Math.max(size, 1), 100),
            contain_access_limit: false,
          }),
          cache: "no-store",
        },
      ),
    ]);
    const departments = (await departmentResponse.json()) as DepartmentListResponse;
    const users = (await userResponse.json()) as DepartmentUserListResponse;

    if (!departmentResponse.ok || departments.errcode !== 0) {
      throw new Error(
        `DingTalk department lookup failed: ${departments.errmsg ?? departmentResponse.statusText}`,
      );
    }
    if (!userResponse.ok || users.errcode !== 0) {
      throw new Error(
        `DingTalk department user lookup failed: ${users.errmsg ?? userResponse.statusText}`,
      );
    }

    return {
      departments: (departments.result ?? []).flatMap((department) =>
        department.dept_id !== undefined && department.name
          ? [{
              id: String(department.dept_id),
              name: department.name,
              ...(department.parent_id === undefined
                ? {}
                : { parentId: String(department.parent_id) }),
            }]
          : [],
      ),
      users: (users.result?.list ?? []).flatMap((user) =>
        user.userid && user.name
          ? [{
              userId: user.userid,
              name: user.name,
              ...(user.title ? { title: user.title } : {}),
            }]
          : [],
      ),
      hasMore: users.result?.has_more === true,
      ...(users.result?.next_cursor === undefined
        ? {}
        : { nextCursor: users.result.next_cursor }),
    };
  }

  async searchDirectoryUsers(
    queryWord: string,
    offset = 0,
    size = 20,
  ): Promise<DingTalkDirectoryPage> {
    const token = await this.getAccessToken();
    const pageSize = Math.min(Math.max(size, 1), 50);
    const searchResponse = await this.fetchImpl(
      `${this.apiBaseUrl}/v1.0/contact/users/search`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-acs-dingtalk-access-token": token,
        },
        body: JSON.stringify({ queryWord, offset, size: pageSize }),
        cache: "no-store",
      },
    );
    const search = (await searchResponse.json()) as UserSearchResponse;
    if (!searchResponse.ok || search.code) {
      throw new Error(
        `DingTalk user search failed: ${search.message ?? searchResponse.statusText}`,
      );
    }

    const userIds = search.list ?? [];
    if (userIds.length === 0) {
      return {
        departments: [],
        users: [],
        hasMore: search.hasMore === true,
        ...(search.hasMore === true ? { nextCursor: offset + pageSize } : {}),
      };
    }

    const batchUrl = new URL(`${this.apiBaseUrl}/v1.0/contact/users/batch/get`);
    batchUrl.searchParams.set("userIdList", JSON.stringify(userIds));
    const detailResponse = await this.fetchImpl(batchUrl, {
      method: "GET",
      headers: {
        "content-type": "application/json",
        "x-acs-dingtalk-access-token": token,
      },
      cache: "no-store",
    });
    const details = (await detailResponse.json()) as BatchUserResponse;
    if (!detailResponse.ok || details.code) {
      throw new Error(
        `DingTalk user detail lookup failed: ${details.message ?? detailResponse.statusText}`,
      );
    }

    const departmentIds = Array.from(new Set(
      (details.userList ?? []).flatMap((user) => user.deptIdList ?? []),
    ));
    const departmentNames = await this.resolveDepartmentNameMap(token, departmentIds);
    const usersById = new Map(
      (details.userList ?? []).flatMap((user) => {
        if (!user.userid || (!user.name && !user.nickname)) return [];
        const departments = (user.deptIdList ?? [])
          .map((departmentId) => departmentNames.get(departmentId))
          .filter((name): name is string => Boolean(name));
        return [[user.userid, {
          userId: user.userid,
          name: user.name ?? user.nickname!,
          ...(user.title ? { title: user.title } : {}),
          ...(departments.length > 0
            ? { department: departments.join(" / ") }
            : {}),
        }] as const];
      }),
    );
    const hasMore = search.hasMore === true;

    return {
      departments: [],
      users: userIds.flatMap((userId) => {
        const user = usersById.get(userId);
        return user ? [user] : [];
      }),
      hasMore,
      ...(hasMore ? { nextCursor: offset + pageSize } : {}),
    };
  }

  async sendDirectReminder(
    input: DirectReminderInput,
  ): Promise<ReminderDelivery> {
    const token = await this.getAccessToken();
    const markdown = `${input.message}\n\n[立即进入投票](${input.actionUrl})`;
    const response = await this.fetchImpl(
      `${this.apiBaseUrl}/v1.0/robot/oToMessages/batchSend`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-acs-dingtalk-access-token": token,
        },
        body: JSON.stringify({
          robotCode: this.robotCode,
          userIds: [input.userId],
          msgKey: "sampleMarkdown",
          msgParam: JSON.stringify({
            title: input.title,
            text: markdown,
          }),
        }),
        cache: "no-store",
      },
    );
    const payload = (await response.json()) as RobotResponse;
    if (!response.ok || payload.code) {
      throw new Error(
        `DingTalk reminder failed: ${payload.message ?? response.statusText}`,
      );
    }

    return {
      requestId: payload.processQueryKey ?? payload.requestId,
    };
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60_000) {
      return this.cachedToken.value;
    }

    const response = await this.fetchImpl(
      `${this.apiBaseUrl}/v1.0/oauth2/accessToken`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appKey: this.appKey,
          appSecret: this.appSecret,
        }),
        cache: "no-store",
      },
    );
    const payload = (await response.json()) as AccessTokenResponse;
    if (!response.ok || !payload.accessToken) {
      throw new Error(
        `DingTalk access-token request failed: ${payload.message ?? response.statusText}`,
      );
    }

    this.cachedToken = {
      value: payload.accessToken,
      expiresAt: now + (payload.expireIn ?? 7200) * 1000,
    };
    return this.cachedToken.value;
  }

  private async resolveDepartmentNames(
    token: string,
    departmentIds: number[],
  ): Promise<string[]> {
    const departmentNames = await this.resolveDepartmentNameMap(token, departmentIds);
    return departmentIds
      .map((departmentId) => departmentNames.get(departmentId))
      .filter((name): name is string => Boolean(name));
  }

  private async resolveDepartmentNameMap(
    token: string,
    departmentIds: number[],
  ): Promise<Map<number, string>> {
    const uniqueIds = Array.from(new Set(departmentIds.filter((id) => id > 1)));
    const entries = await Promise.all(uniqueIds.map(async (departmentId) => {
      const response = await this.fetchImpl(
        `${this.legacyApiBaseUrl}/topapi/v2/department/get?access_token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ dept_id: departmentId }),
          cache: "no-store",
        },
      );
      const payload = (await response.json()) as DepartmentDetailResponse;
      if (!response.ok || payload.errcode !== 0 || !payload.result?.name) {
        throw new Error(
          `DingTalk department detail lookup failed: ${payload.errmsg ?? response.statusText}`,
        );
      }
      return [departmentId, payload.result.name] as const;
    }));
    return new Map(entries);
  }
}
