import { randomBytes, timingSafeEqual } from "node:crypto";
import { normalizeReturnTo } from "@/lib/auth/return-to";

export const DINGTALK_WEB_OAUTH_STATE_COOKIE =
  "committee_vote_dingtalk_oauth_state";
export const DINGTALK_WEB_OAUTH_STATE_MAX_AGE = 10 * 60;
export const DINGTALK_WEB_RETURN_TO_COOKIE =
  "committee_vote_dingtalk_return_to";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured for DingTalk web login`);
  return value;
}

export function getDingTalkWebRedirectUri(): string {
  const value = requiredEnvironment("DINGTALK_WEB_REDIRECT_URI");
  const url = new URL(value);
  const privateNetworkAllowed =
    process.env.DINGTALK_WEB_ALLOW_INSECURE_REDIRECT === "true" &&
    isPrivateNetworkHost(url.hostname);
  if (
    url.protocol !== "https:" &&
    url.hostname !== "127.0.0.1" &&
    url.hostname !== "localhost" &&
    !privateNetworkAllowed
  ) {
    throw new Error(
      "DINGTALK_WEB_REDIRECT_URI must use HTTPS except on loopback or an explicitly enabled private development host",
    );
  }
  return url.toString();
}

export function isPrivateNetworkHost(hostname: string): boolean {
  if (hostname.startsWith("10.")) return true;
  if (hostname.startsWith("192.168.")) return true;
  const match = /^172\.(\d{1,2})\./.exec(hostname);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

export function createDingTalkWebOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function buildDingTalkPostLoginUrl(path: string): URL {
  return new URL(normalizeReturnTo(path) ?? "/", getDingTalkWebRedirectUri());
}

export function validateDingTalkWebOAuthState(
  expected: string | undefined,
  received: string | null,
): boolean {
  if (!expected || !received) return false;
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return (
    expectedBytes.length === receivedBytes.length &&
    timingSafeEqual(expectedBytes, receivedBytes)
  );
}

export function buildDingTalkWebAuthorizationUrl(state: string): URL {
  const clientId = requiredEnvironment("DINGTALK_CLIENT_ID");
  const corpId = process.env.DINGTALK_CORP_ID?.trim();
  const url = new URL("https://login.dingtalk.com/oauth2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getDingTalkWebRedirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", "openid corpid");
  if (corpId) url.searchParams.set("corpId", corpId);
  return url;
}
