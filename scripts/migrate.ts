import { closeDatabase, ensureDatabaseReady } from "../src/server/db";

async function main(): Promise<void> {
  await ensureDatabaseReady();
  process.stdout.write("Database schema is up to date.\n");
}

main()
  .then(() => closeDatabase())
  .catch((error: unknown) => {
    process.stderr.write(
      `Database migration failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });

