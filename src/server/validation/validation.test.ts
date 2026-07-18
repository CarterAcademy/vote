import { describe, expect, it } from "vitest";

import { createPollSchema, voteSchema } from "./index";

describe("voteSchema", () => {
  it.each(["APPROVE", "REJECT"] as const)(
    "requires an opinion for %s",
    (choice) => {
      const result = voteSchema.safeParse({ choice, opinion: "   " });
      expect(result.success).toBe(false);
    },
  );

  it("allows abstention without an opinion", () => {
    expect(voteSchema.parse({ choice: "ABSTAIN" })).toEqual({
      choice: "ABSTAIN",
      opinion: null,
    });
  });

  it("trims a submitted opinion", () => {
    expect(
      voteSchema.parse({ choice: "APPROVE", opinion: "  同意推荐。 " }),
    ).toEqual({ choice: "APPROVE", opinion: "同意推荐。" });
  });
});

describe("createPollSchema", () => {
  it("rejects a deadline before the start time", () => {
    const result = createPollSchema.safeParse({
      committeeId: "10000000-0000-4000-8000-000000000001",
      title: "高级职称评审",
      candidateName: "张伟",
      startsAt: "2026-07-18T09:00:00+08:00",
      deadlineAt: "2026-07-18T08:00:00+08:00",
    });

    expect(result.success).toBe(false);
  });
});

