import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ensureDatabaseReady } from "@/server/db";
import {
  closeExpiredPolls,
  sendScheduledPollNotifications,
} from "@/server/services";
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
    // Send reminders before closing expired polls so a delayed maintenance run
    // can still process every poll that remains inside a reminder window.
    let notifications: Awaited<ReturnType<typeof sendScheduledPollNotifications>>;
    let notificationError: unknown;
    try {
      notifications = await sendScheduledPollNotifications();
    } catch (error) {
      notificationError = error;
      notifications = {
        processedPolls: 0,
        requested: 0,
        sent: 0,
        failed: 0,
        batches: [],
      };
    }
    const closeResult = await closeExpiredPolls();
    if (notificationError) throw notificationError;
    return ok({ ...closeResult, notifications });
  } catch (error) {
    return routeError(error);
  }
}
