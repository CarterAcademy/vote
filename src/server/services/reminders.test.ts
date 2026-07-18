import { describe, expect, it } from "vitest";

import { reminderCooldownRemaining } from "./reminders";

describe("reminderCooldownRemaining", () => {
  const now = new Date("2026-07-17T12:00:00.000Z");

  it("returns the seconds remaining in the cooldown", () => {
    expect(
      reminderCooldownRemaining(
        now,
        new Date("2026-07-17T11:59:42.000Z"),
      ),
    ).toBe(42);
  });

  it("never returns a negative value", () => {
    expect(
      reminderCooldownRemaining(
        now,
        new Date("2026-07-17T11:58:00.000Z"),
      ),
    ).toBe(0);
  });
});
