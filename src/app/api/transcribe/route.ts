import { requireSessionUser } from "@/server/auth/session";
import {
  internalTranscriptionConfigured,
} from "@/server/llm/transcription";
import { ok, routeError } from "../_lib/http";

export async function GET() {
  try {
    await requireSessionUser();
    return ok({ available: internalTranscriptionConfigured() });
  } catch (error) {
    return routeError(error);
  }
}
