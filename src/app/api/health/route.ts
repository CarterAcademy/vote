import { sql } from "kysely";
import { ensureDatabaseReady, getDatabase } from "@/server/db";
import { ok, routeError } from "../_lib/http";

export async function GET() {
  try {
    await ensureDatabaseReady();
    await sql`select 1`.execute(getDatabase());
    return ok({ status: "ok", database: "ready", checkedAt: new Date().toISOString() });
  } catch (error) {
    return routeError(error);
  }
}
