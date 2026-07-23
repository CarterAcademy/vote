import { describe, expect, it } from "vitest";

import { buildLoginPath, normalizeReturnTo } from "./return-to";

describe("authentication return destinations", () => {
  it("preserves protected routes and their query strings", () => {
    expect(normalizeReturnTo("/admin/polls/123?tab=results")).toBe(
      "/admin/polls/123?tab=results",
    );
    expect(normalizeReturnTo("/vote/123")).toBe("/vote/123");
    expect(buildLoginPath("/admin")).toBe("/?next=%2Fadmin");
  });

  it("rejects external and non-protected destinations", () => {
    expect(normalizeReturnTo("https://example.com/admin")).toBeNull();
    expect(normalizeReturnTo("//example.com/admin")).toBeNull();
    expect(normalizeReturnTo("/\\example.com/admin")).toBeNull();
    expect(normalizeReturnTo("/api/logout")).toBeNull();
  });
});
