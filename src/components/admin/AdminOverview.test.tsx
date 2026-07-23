import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/client/api";
import type { Committee, CommitteeMember, PollListResponse } from "@/lib/client/types";
import { AdminOverview } from "./AdminOverview";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/client/session", () => ({
  useSession: () => ({ mockMode: true, corpId: null }),
}));

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/PollAttachmentLinks", () => ({
  PollAttachmentLinks: () => null,
}));

vi.mock("./DirectoryPersonPicker", () => ({
  DirectoryPersonPicker: ({ onSelect }: {
    onSelect: (person: {
      dingtalkUserId: string;
      name: string;
      department: string;
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onSelect({
        dingtalkUserId: "dt-member-1",
        name: "重复委员",
        department: "测试部门",
      })}
    >
      添加重复评审人
    </button>
  ),
}));

const polls: PollListResponse = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
};

const committee: Committee = {
  id: "10000000-0000-4000-8000-000000000001",
  code: "TEST",
  name: "测试委员会",
  memberCount: 2,
};

const members: CommitteeMember[] = [
  {
    id: "member-1",
    userId: "user-1",
    dingtalkUserId: "dt-member-1",
    name: "重复委员",
    department: "测试部门",
    position: "委员",
    joinedAt: "2026-07-22T08:00:00.000Z",
  },
  {
    id: "member-2",
    userId: "user-2",
    dingtalkUserId: "dt-member-2",
    name: "另一委员",
    department: "测试部门",
    position: "委员",
    joinedAt: "2026-07-22T08:00:00.000Z",
  },
];

function openCreateDialog() {
  fireEvent.click(screen.getAllByRole("button", { name: "发起投票" })[0]);
}

describe("AdminOverview poll creation", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("uses localized inline validation and exposes invalid fields to assistive technology", async () => {
    render(<AdminOverview initialPolls={polls} initialCommittees={[committee]} />);
    openCreateDialog();

    fireEvent.click(await screen.findByRole("button", { name: "确认发起并发送通知" }));

    const candidateInput = screen.getByRole("textbox", { name: /人选姓名/ });
    const titleInput = screen.getByRole("textbox", { name: /投票标题/ });
    const committeeSelect = screen.getByRole("combobox", { name: "评审委员会" });
    expect(screen.getByText("请输入人选姓名")).toBeInTheDocument();
    expect(screen.getByText("请输入投票标题")).toBeInTheDocument();
    expect(screen.getByText("请至少选择一个委员会或一名评审人")).toBeInTheDocument();
    expect(candidateInput).toHaveAttribute("aria-invalid", "true");
    expect(candidateInput).toHaveAttribute("aria-describedby");
    expect(titleInput).toHaveAttribute("aria-invalid", "true");
    expect(committeeSelect).toHaveAttribute("aria-invalid", "true");
    expect(document.querySelector("#create-poll-form")).toHaveAttribute("novalidate");
  });

  it("shows the exact deduplicated DingTalk recipient count in the warning and launch action", async () => {
    const loadMembers = vi.spyOn(api, "committeeMembers").mockResolvedValue(members);
    render(<AdminOverview initialPolls={polls} initialCommittees={[committee]} />);
    openCreateDialog();

    fireEvent.change(screen.getByRole("combobox", { name: "评审委员会" }), {
      target: { value: committee.id },
    });

    expect(await screen.findByRole("button", { name: "发起并通知 2 人" })).toBeInTheDocument();
    expect(loadMembers).toHaveBeenCalledWith(committee.id);

    fireEvent.click(screen.getByRole("button", { name: "从通讯录选择" }));
    fireEvent.click(screen.getByRole("button", { name: "添加重复评审人" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "发起并通知 2 人" })).toBeInTheDocument();
      expect(screen.getByText(/立即通知去重后的 2 名评审人/)).toBeInTheDocument();
    });
  });

  it("selects all committee members by default and lets the initiator exclude individuals", async () => {
    vi.spyOn(api, "committeeMembers").mockResolvedValue(members);
    render(<AdminOverview initialPolls={polls} initialCommittees={[committee]} />);
    openCreateDialog();

    fireEvent.change(screen.getByRole("combobox", { name: "评审委员会" }), {
      target: { value: committee.id },
    });

    expect(await screen.findByText("已选 2 / 2 人")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "取消选择重复委员" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "取消选择另一委员" })).toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: "取消选择另一委员" }));

    expect(screen.getByText("已选 1 / 2 人")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发起并通知 1 人" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /本场参评成员/ }));
    expect(screen.queryByRole("checkbox", { name: "取消选择重复委员" })).not.toBeInTheDocument();
  });
});
