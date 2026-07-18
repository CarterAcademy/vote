import { describe, expect, it } from "vitest";

import { calculateVoteStats } from "./stats";

describe("calculateVoteStats", () => {
  it("calculates turnout against eligible voters and choices against submissions", () => {
    expect(
      calculateVoteStats(10, ["APPROVE", "APPROVE", "REJECT", "ABSTAIN"]),
    ).toEqual({
      totalVoters: 10,
      submittedCount: 4,
      missingCount: 6,
      turnoutPercentage: 40,
      choices: [
        { choice: "APPROVE", count: 2, percentage: 50 },
        { choice: "REJECT", count: 1, percentage: 25 },
        { choice: "ABSTAIN", count: 1, percentage: 25 },
      ],
    });
  });

  it("returns zero percentages before anyone has voted", () => {
    const result = calculateVoteStats(9, []);
    expect(result.submittedCount).toBe(0);
    expect(result.choices.every((choice) => choice.percentage === 0)).toBe(true);
  });
});

