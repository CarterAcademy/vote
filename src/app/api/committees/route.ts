import { requireHr } from "@/server/auth/session";
import { ensureDatabaseReady } from "@/server/db";
import { listCommittees } from "@/server/services";
import { ok, routeError } from "../_lib/http";

export async function GET() {
  try {
    await ensureDatabaseReady();
    await requireHr();
    return ok({ items: await listCommittees() });
  } catch (error) {
    return routeError(error);
  }
}
