import type { DingTalkGateway } from "./gateway";
import { MockDingTalkGateway } from "./mock";
import { RealDingTalkGateway } from "./real";

let singleton: DingTalkGateway | undefined;

export function getDingTalkGateway(): DingTalkGateway {
  if (singleton) return singleton;

  const appKey = process.env.DINGTALK_CLIENT_ID?.trim();
  const appSecret = process.env.DINGTALK_CLIENT_SECRET?.trim();
  const forceMock = process.env.DINGTALK_MOCK_ENABLED === "true";

  if (forceMock && process.env.NODE_ENV === "production") {
    throw new Error("DINGTALK_MOCK_ENABLED must be false in production");
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
