import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  DirectoryPersonPicker,
  type DirectoryPerson,
} from "./DirectoryPersonPicker";

function Picker({ excludedUserIds = [] }: { excludedUserIds?: string[] }) {
  const [selected, setSelected] = useState<DirectoryPerson | null>(null);
  return (
    <DirectoryPersonPicker
      open
      mockMode
      excludedUserIds={excludedUserIds}
      selected={selected}
      onSelect={setSelected}
    />
  );
}

describe("DirectoryPersonPicker", () => {
  it("searches and selects a person from the mock organization directory", () => {
    render(<Picker />);

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索企业通讯录人员" }), {
      target: { value: "科研" },
    });

    expect(screen.getByText("丁若楠")).toBeInTheDocument();
    expect(screen.queryByText("郑博文")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "选择丁若楠" }));

    expect(screen.getByText("已选择 丁若楠")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "选择丁若楠" })).toBeChecked();
  });

  it("does not show people who are already initiators", () => {
    render(<Picker excludedUserIds={["dt_mock_directory_01"]} />);

    expect(screen.queryByText("郑博文")).not.toBeInTheDocument();
    expect(screen.getByText("沈嘉禾")).toBeInTheDocument();
  });
});
