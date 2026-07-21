import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { INTRO_NICKNAME_COUNT, nicknameForHash } from "./intro-comments";

describe("intro comment nicknames", () => {
  it("contains exactly 5,000 stable, unique cute nicknames", () => {
    const nicknames = new Set<string>();
    for (let index = 0; index < INTRO_NICKNAME_COUNT; index += 1) {
      nicknames.add(nicknameForHash(index.toString(16).padStart(12, "0")));
    }

    expect(INTRO_NICKNAME_COUNT).toBe(5000);
    expect(nicknames.size).toBe(5000);
  });

  it("returns the same nickname for the same hash", () => {
    const hash = createHash("sha256").update("203.0.113.8").digest("hex");
    expect(nicknameForHash(hash)).toBe(nicknameForHash(hash));
  });
});
