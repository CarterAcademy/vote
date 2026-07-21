import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/client/api";
import { IntroComments } from "./IntroComments";

vi.mock("@/lib/client/session", () => ({
  useSession: () => ({ user: null }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/intro",
}));

vi.mock("./member/VoiceOpinionInput", () => ({
  VoiceOpinionInput: () => <textarea aria-label="评论内容" />,
}));

describe("IntroComments", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads an empty comment list only once while the panel stays open", async () => {
    const request = vi.spyOn(api, "introComments").mockResolvedValue([]);
    render(<IntroComments />);

    fireEvent.click(screen.getByRole("button", { name: "打开评论" }));

    await waitFor(() => expect(screen.getByText("还没有评论")).toBeInTheDocument());
    await new Promise((resolve) => window.setTimeout(resolve, 25));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("can collapse to the right edge and expand without opening the panel", () => {
    render(<IntroComments />);

    fireEvent.click(screen.getByRole("button", { name: "将评论按钮收起到右侧" }));
    expect(screen.getByRole("button", { name: "展开评论按钮" })).toBeInTheDocument();
    expect(screen.queryByLabelText("评论")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展开评论按钮" }));
    expect(screen.getByRole("button", { name: "打开评论" })).toBeInTheDocument();
  });
});
