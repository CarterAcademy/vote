import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Committee, CommitteeMember } from "@/lib/client/types";
import { CommitteeManagement } from "./CommitteeManagement";

vi.mock("@/lib/client/session", () => ({
  useSession: () => ({ mockMode: true, corpId: null }),
}));

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const committees: Committee[] = [
  { id: "10000000-0000-4000-8000-000000000001", code: "ACADEMIC", name: "学术委员会", memberCount: 1 },
  { id: "10000000-0000-4000-8000-000000000002", code: "TECHNICAL", name: "技术委员会", memberCount: 1 },
];

const membersByCommittee: Record<string, CommitteeMember[]> = {
  [committees[0].id]: [{
    id: "member-1",
    userId: "user-1",
    dingtalkUserId: "dt-member-1",
    name: "王建国",
    department: "战略研究部",
    position: "主任委员",
    joinedAt: "2026-07-22T08:00:00.000Z",
  }],
  [committees[1].id]: [{
    id: "member-2",
    userId: "user-2",
    dingtalkUserId: "dt-member-2",
    name: "徐国平",
    department: "技术委员会",
    position: "主任委员",
    joinedAt: "2026-07-22T08:00:00.000Z",
  }],
};

describe("CommitteeManagement member panel", () => {
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

  afterEach(() => {
    cleanup();
  });

  it("places the mobile member panel directly after the selected committee", () => {
    render(
      <CommitteeManagement
        initialCommittees={committees}
        initialMembersByCommittee={membersByCommittee}
      />,
    );

    const committeeGrid = screen.getByRole("region", { name: "委员会选择" });
    const academicCard = screen.getByRole("article", { name: "学术委员会，1 名在任委员" });
    const technicalCard = screen.getByRole("article", { name: "技术委员会，1 名在任委员" });

    fireEvent.click(within(academicCard).getByRole("button", { name: "管理成员" }));

    const academicPanel = within(committeeGrid).getByRole("region", { name: "学术委员会成员管理", hidden: true });
    expect(academicPanel.previousElementSibling).toBe(academicCard);
    expect(within(academicCard).getByRole("button", { name: "收起成员" })).toHaveAttribute("aria-expanded", "true");
    expect(within(academicPanel).getByRole("heading", { name: "学术委员会" })).toBeInTheDocument();

    fireEvent.click(within(technicalCard).getByRole("button", { name: "管理成员" }));

    const technicalPanel = within(committeeGrid).getByRole("region", { name: "技术委员会成员管理", hidden: true });
    expect(technicalPanel.previousElementSibling).toBe(technicalCard);
    expect(within(committeeGrid).queryByRole("region", { name: "学术委员会成员管理", hidden: true })).not.toBeInTheDocument();
  });
});
