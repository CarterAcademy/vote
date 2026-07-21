import { afterEach, describe, expect, it, vi } from "vitest";

import { shouldUseSecureSessionCookie } from "./session";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("shouldUseSecureSessionCookie", () => {
  it("keeps production cookies secure by default", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DINGTALK_MOCK_ENABLED", "false");
    vi.stubEnv("DINGTALK_APP_BASE_URL", "http://10.1.130.9:3011");

    expect(shouldUseSecureSessionCookie()).toBe(true);
  });

  it("allows a non-secure cookie only for an explicitly approved private HTTP target", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DINGTALK_MOCK_ENABLED", "false");
    vi.stubEnv("SESSION_COOKIE_SECURE", "false");
    vi.stubEnv("DINGTALK_APP_ALLOW_INSECURE_BASE_URL", "true");
    vi.stubEnv("DINGTALK_APP_BASE_URL", "http://10.1.130.9:3011");

    expect(shouldUseSecureSessionCookie()).toBe(false);

    vi.stubEnv("DINGTALK_APP_BASE_URL", "http://vote.example.com");
    expect(shouldUseSecureSessionCookie()).toBe(true);
  });
});
