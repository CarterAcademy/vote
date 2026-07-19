import type { DingTalkGateway } from "./gateway";
import { MockDingTalkGateway } from "./mock";
import { RealDingTalkGateway } from "./real";

let singleton: DingTalkGateway | undefined;

export function isMockModeEnabled(): boolean {
  const requested = process.env.DINGTALK_MOCK_ENABLED === "true";
  return (
    requested &&
    (process.env.NODE_ENV !== "production" ||
      process.env.ALLOW_INSECURE_PRODUCTION_MOCK === "true")
  );
}

export function getDingTalkGateway(): DingTalkGateway {
  if (singleton) return singleton;

  const appKey = process.env.DINGTALK_CLIENT_ID?.trim();
  const appSecret = process.env.DINGTALK_CLIENT_SECRET?.trim();
  const forceMock = isMockModeEnabled();

  if (
    process.env.DINGTALK_MOCK_ENABLED === "true" &&
    process.env.NODE_ENV === "production" &&
    !forceMock
  ) {
    throw new Error(
      "DINGTALK_MOCK_ENABLED requires ALLOW_INSECURE_PRODUCTION_MOCK=true in a production build",
    );
  }

  if (forceMock || !appKey || !appSecret) {
    if (process.env.NODE_ENV === "production" && !forceMock) {
      throw new Error(
        "DINGTALK_CLIENT_ID and DINGTALK_CLIENT_SECRET are required in production",
      );
    }
    singleton = new MockDingTalkGateway();
  } else {
    singleton = new RealDingTalkGateway({
      appKey,
      appSecret,
      robotCode: process.env.DINGTALK_ROBOT_CODE?.trim(),
    });
  }

  return singleton;
}

export function setDingTalkGatewayForTests(
  gateway: DingTalkGateway | undefined,
): void {
  singleton = gateway;
}

export type * from "./gateway";
export { MockDingTalkGateway } from "./mock";
export { RealDingTalkGateway, type RealDingTalkOptions } from "./real";
