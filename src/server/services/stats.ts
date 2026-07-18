import type { ChoiceStat, VoteChoice } from "@/types";

const CHOICES: VoteChoice[] = ["APPROVE", "REJECT", "ABSTAIN"];

export interface PollStats {
  totalVoters: number;
  submittedCount: number;
  missingCount: number;
  turnoutPercentage: number;
  choices: ChoiceStat[];
}

function percentage(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function calculateVoteStats(
  totalVoters: number,
  submittedChoices: readonly VoteChoice[],
): PollStats {
  const safeTotal = Math.max(0, totalVoters);
  const submittedCount = submittedChoices.length;

  return {
    totalVoters: safeTotal,
    submittedCount,
    missingCount: Math.max(0, safeTotal - submittedCount),
    turnoutPercentage: percentage(submittedCount, safeTotal),
    choices: CHOICES.map((choice) => {
      const count = submittedChoices.filter((item) => item === choice).length;
      return {
        choice,
        count,
        percentage: percentage(count, submittedCount),
      };
    }),
  };
}

