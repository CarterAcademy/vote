import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/client/api";
import { ExperienceRatingPrompt } from "./ExperienceRatingPrompt";

describe("ExperienceRatingPrompt", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reveals optional reasons after a score and submits the member rating", async () => {
    vi.spyOn(api, "experienceRatingStatus").mockResolvedValue({
      eligible: true,
      cooldownDays: 90,
    });
    const submit = vi.spyOn(api, "submitExperienceRating").mockResolvedValue({
      eligible: false,
      cooldownDays: 90,
    });

    render(<ExperienceRatingPrompt context="MEMBER" activationKey={1} />);

    await screen.findByText("所有待办已完成");
    fireEvent.click(screen.getByRole("button", { name: "4 分，满意" }));
    fireEvent.click(screen.getByRole("button", { name: "操作清晰" }));
    fireEvent.click(screen.getByRole("button", { name: "提交评价" }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith("MEMBER", {
      outcome: "RATED",
      score: 4,
      tags: ["操作清晰"],
    }));
    expect(await screen.findByText("感谢你的评价")).toBeInTheDocument();
  });

  it("records a dismissal so the prompt respects the cooldown", async () => {
    vi.spyOn(api, "experienceRatingStatus").mockResolvedValue({
      eligible: true,
      cooldownDays: 90,
    });
    const submit = vi.spyOn(api, "submitExperienceRating").mockResolvedValue({
      eligible: false,
      cooldownDays: 90,
    });

    render(<ExperienceRatingPrompt context="ADMIN" activationKey={2} />);
    await screen.findByText("本次投票管理流程体验如何？");
    fireEvent.click(screen.getByRole("button", { name: "暂不评价" }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith("ADMIN", {
      outcome: "DISMISSED",
    }));
  });
});
