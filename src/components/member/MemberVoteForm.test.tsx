import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberPollDetail } from "@/lib/client/types";
import { MemberVoteForm } from "./MemberVoteForm";

const { pushMock, voteMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  voteMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/client/api", () => ({
  api: {
    memberPoll: vi.fn(),
    vote: voteMock,
  },
  errorMessage: (error: unknown) => String(error),
}));

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: PropsWithChildren) => <>{children}</>,
}));

vi.mock("./VoiceOpinionInput", () => ({
  VoiceOpinionInput: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="详细评审意见"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const detail: MemberPollDetail = {
  poll: {
    id: "poll-1",
    title: "候选人评审",
    candidateName: "测试候选人",
    committeeName: "学术委员会",
    status: "OPEN",
    deadlineAt: "2099-07-22T18:00:00.000Z",
    attachments: [],
  },
  myVote: null,
  canEdit: true,
};

describe("MemberVoteForm", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    pushMock.mockReset();
    voteMock.mockReset();
    voteMock.mockResolvedValue({
      vote: {
        choice: "APPROVE",
        opinion: "同意通过",
        version: 1,
        submittedAt: "2026-07-21T08:00:00.000Z",
        updatedAt: "2026-07-21T08:00:00.000Z",
        voiceRecordings: [],
      },
    });
  });

  it("returns to the vote list after the first successful submission", async () => {
    render(<MemberVoteForm pollId="poll-1" initialDetail={detail} />);

    fireEvent.click(screen.getByRole("radio", { name: "通过 支持该人选通过本次评审" }));
    fireEvent.change(screen.getByRole("textbox", { name: "详细评审意见" }), {
      target: { value: "同意通过" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认提交" }));

    await waitFor(() => expect(voteMock).toHaveBeenCalledWith("poll-1", "APPROVE", "同意通过", []));
    expect(pushMock).toHaveBeenCalledWith("/vote");
  });
});
