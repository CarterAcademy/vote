import {
  closeDatabase,
  ensureDatabaseReady,
  isInMemoryDatabase,
  seedDatabase,
} from "../src/server/db";

async function main(): Promise<void> {
  const db = await ensureDatabaseReady();
  if (!isInMemoryDatabase()) {
    await seedDatabase(db);
  }
  process.stdout.write("Demo committees, users, polls, and votes are ready.\n");
}

main()
  .then(() => closeDatabase())
  .catch((error: unknown) => {
    process.stderr.write(
      `Database seed failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
