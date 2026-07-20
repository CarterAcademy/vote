import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect } from "kysely";
import { DataType, newDb, type IMemoryDb } from "pg-mem";
import { Pool } from "pg";

import { migrateDatabase } from "./schema";
import { seedDatabase } from "./seed";
import type { DatabaseSchema } from "./types";

interface DatabaseHolder {
  db: Kysely<DatabaseSchema>;
  pool: Pool;
  memory?: IMemoryDb;
  ready?: Promise<void>;
}

const globalDatabase = globalThis as typeof globalThis & {
  __committeeVoteDatabase?: DatabaseHolder;
};

function makeMemoryDatabase(): IMemoryDb {
  const memory = newDb({ autoCreateForeignKeyIndices: true });
  memory.public.registerFunction({
    name: "trim",
    args: [DataType.text],
    returns: DataType.text,
    implementation: (value: string) => value.trim(),
  });
  memory.public.registerFunction({
    name: "length",
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (value: string) => value.length,
  });
  return memory;
}

function makeDatabase(): DatabaseHolder {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (connectionString) {
    const pool = new Pool({ connectionString });
    return {
      pool,
      db: new Kysely<DatabaseSchema>({
        dialect: new PostgresDialect({ pool }),
      }),
    };
  }

  const memory = makeMemoryDatabase();
  const memoryPg = memory.adapters.createPg();
  const pool = new memoryPg.Pool() as unknown as Pool;

  return {
    pool,
    memory,
    db: new Kysely<DatabaseSchema>({
      dialect: new PostgresDialect({ pool }),
    }),
  };
}

async function provisionDevelopmentAdmin(
  db: Kysely<DatabaseSchema>,
): Promise<void> {
  const dingtalkUserId = process.env.DINGTALK_DEV_ADMIN_USER_ID?.trim();
  const name = process.env.DINGTALK_DEV_ADMIN_NAME?.trim();
  const department = process.env.DINGTALK_DEV_ADMIN_DEPARTMENT?.trim() || null;

  if (!dingtalkUserId || !name) {
    throw new Error(
      "DINGTALK_DEV_ADMIN_USER_ID and DINGTALK_DEV_ADMIN_NAME are required when local in-memory development uses real DingTalk",
    );
  }

  await db
    .insertInto("users")
    .values({
      id: randomUUID(),
      dingtalk_user_id: dingtalkUserId,
      name,
      department,
      role: "HR",
    })
    .onConflict((conflict) =>
      conflict.column("dingtalk_user_id").doUpdateSet({
        name,
        department,
        role: "HR",
        is_active: true,
        updated_at: new Date(),
      }),
    )
    .execute();
}

export function getDatabase(): Kysely<DatabaseSchema> {
  globalDatabase.__committeeVoteDatabase ??= makeDatabase();
  return globalDatabase.__committeeVoteDatabase.db;
}

export async function ensureDatabaseReady(): Promise<Kysely<DatabaseSchema>> {
  globalDatabase.__committeeVoteDatabase ??= makeDatabase();
  const holder = globalDatabase.__committeeVoteDatabase;
  // Persistent databases are migrated by the deployment job before the web
  // process starts. Keeping DDL out of request handling avoids cold-start
  // latency and prevents multiple app replicas from racing to run migrations.
  holder.ready ??= holder.memory
    ? (async () => {
        await migrateDatabase(holder.db);
        if (
          process.env.NODE_ENV === "test" ||
          process.env.DINGTALK_MOCK_ENABLED === "true"
        ) {
          await seedDatabase(holder.db);
        } else {
          await provisionDevelopmentAdmin(holder.db);
        }
      })()
    : Promise.resolve();
  await holder.ready;
  return holder.db;
}

export function isInMemoryDatabase(): boolean {
  globalDatabase.__committeeVoteDatabase ??= makeDatabase();
  return Boolean(globalDatabase.__committeeVoteDatabase.memory);
}

export async function closeDatabase(): Promise<void> {
  const holder = globalDatabase.__committeeVoteDatabase;
  if (!holder) return;

  await holder.db.destroy();
  delete globalDatabase.__committeeVoteDatabase;
}

export function createIsolatedMemoryDatabase(): {
  db: Kysely<DatabaseSchema>;
  migrate: () => Promise<void>;
  destroy: () => Promise<void>;
} {
  const memory = makeMemoryDatabase();
  const memoryPg = memory.adapters.createPg();
  const pool = new memoryPg.Pool() as unknown as Pool;
  const db = new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });

  return {
    db,
    migrate: () => migrateDatabase(db),
    destroy: () => db.destroy(),
  };
}
