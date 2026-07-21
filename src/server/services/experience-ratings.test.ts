import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SessionUser } from "@/types";
import { closeDatabase, ensureDatabaseReady } from "../db";
import {
  EXPERIENCE_RATING_COOLDOWN_DAYS,
  getExperienceRatingStatus,
  recordExperienceRating,
} from "./experience-ratings";

const member: SessionUser = {
  id: "00000000-0000-4000-8000-000000000391",
  dingtalkUserId: "dt_rating_member",
  name: "体验评分委员",
  role: "MEMBER",
};

const admin: SessionUser = {
  id: "00000000-0000-4000-8000-000000000392",
  dingtalkUserId: "dt_rating_admin",
  name: "体验评分管理员",
  role: "HR",
};

describe("experience rating cooldown", () => {
  beforeAll(async () => {
    const db = await ensureDatabaseReady();
    await db.insertInto("users").values([
      {
        id: member.id,
        dingtalk_user_id: member.dingtalkUserId,
        name: member.name,
        role: member.role,
      },
      {
        id: admin.id,
        dingtalk_user_id: admin.dingtalkUserId,
        name: admin.name,
        role: admin.role,
      },
    ]).execute();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("applies a 90 day cooldown after a rating or dismissal", async () => {
    expect(await getExperienceRatingStatus("MEMBER", member)).toEqual({
      eligible: true,
      cooldownDays: EXPERIENCE_RATING_COOLDOWN_DAYS,
    });

    await recordExperienceRating({
      context: "MEMBER",
      outcome: "RATED",
      score: 4,
      tags: ["操作清晰"],
    }, member);

    expect((await getExperienceRatingStatus("MEMBER", member)).eligible).toBe(false);

    const db = await ensureDatabaseReady();
    await db.updateTable("experience_ratings")
      .set({ created_at: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000) })
      .where("user_id", "=", member.id)
      .execute();

    expect((await getExperienceRatingStatus("MEMBER", member)).eligible).toBe(true);
  });

  it("keeps member and management cooldowns separate", async () => {
    await recordExperienceRating({ context: "ADMIN", outcome: "DISMISSED" }, admin);
    expect((await getExperienceRatingStatus("ADMIN", admin)).eligible).toBe(false);
    await expect(getExperienceRatingStatus("MEMBER", admin)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
