import type {
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

interface RobotResponse {
  processQueryKey?: string;
  code?: string;
  message?: string;
  requestId?: string;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

export interface RealDingTalkOptions {
  appKey: string;
  appSecret: string;
  robotCode?: string;
  apiBaseUrl?: string;
  legacyApiBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class RealDingTalkGateway implements DingTalkGateway {
  private readonly appKey: string;
  private readonly appSecret: string;
  private readonly robotCode: string;
  private readonly apiBaseUrl: string;
  private readonly legacyApiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private cachedToken?: CachedToken;

  constructor(options: RealDingTalkOptions) {
    this.appKey = options.appKey;
    this.appSecret = options.appSecret;
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

    return {
      userId: payload.result.userid,
      name: payload.result.name,
      unionId: payload.result.unionid,
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
}

