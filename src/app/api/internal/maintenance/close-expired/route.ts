import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ensureDatabaseReady } from "@/server/db";
import { closeExpiredPolls } from "@/server/services";
import { DomainError } from "@/server/services/errors";
import { ok, routeError } from "../../../_lib/http";

function secretMatches(provided: string | null, expected: string | undefined) {
  if (!provided || !expected) return false;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return (
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes)
  );
}

export async function POST(request: NextRequest) {
  try {
    if (!secretMatches(request.headers.get("x-maintenance-secret"), process.env.MAINTENANCE_SECRET)) {
      throw new DomainError("UNAUTHENTICATED", "维护任务凭据无效");
    }
    await ensureDatabaseReady();
    return ok(await closeExpiredPolls());
  } catch (error) {
    return routeError(error);
  }
}
