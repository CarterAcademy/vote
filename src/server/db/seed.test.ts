import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createIsolatedMemoryDatabase } from "./database";
import { seedDatabase } from "./seed";

const database = createIsolatedMemoryDatabase();

describe("demo database seed", () => {
  beforeAll(async () => {
    await database.migrate();
    await seedDatabase(database.db);
  });

  afterAll(async () => {
    await database.destroy();
  });

  it("provides demo identities without mocked poll data", async () => {
    const [users, committees, polls, votes, voiceRecordings] = await Promise.all([
      database.db.selectFrom("users").select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow(),
      database.db.selectFrom("committees").select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow(),
      database.db.selectFrom("polls").select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow(),
      database.db.selectFrom("votes").select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow(),
      database.db.selectFrom("vote_voice_recordings").select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow(),
    ]);

    expect(Number(users.count)).toBe(19);
    expect(Number(committees.count)).toBe(2);
    expect(Number(polls.count)).toBe(0);
    expect(Number(votes.count)).toBe(0);
    expect(Number(voiceRecordings.count)).toBe(0);
  });
});
