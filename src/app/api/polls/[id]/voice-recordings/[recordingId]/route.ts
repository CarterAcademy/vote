import { NextRequest } from "next/server";

import { requireSessionUser } from "@/server/auth/session";
import { deleteStoredVoiceRecording, readStoredVoiceRecording } from "@/server/files/voice-recordings";
import { deleteDraftVoiceRecording, getVoiceRecordingForPlayback } from "@/server/services";
import { assertSameOrigin, ok, routeError } from "../../../../_lib/http";

export const runtime = "nodejs";

function byteRange(range: string | null, length: number): { start: number; end: number } | null {
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, length - Number(match[2]));
  const end = match[2] && match[1] ? Math.min(Number(match[2]), length - 1) : length - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start <= end && start < length
    ? { start, end }
    : null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; recordingId: string }> },
) {
  try {
    const actor = await requireSessionUser();
    const { id: pollId, recordingId } = await context.params;
    const recording = await getVoiceRecordingForPlayback(pollId, recordingId, actor);
    const buffer = await readStoredVoiceRecording(recording.storedName);
    const range = byteRange(request.headers.get("range"), buffer.byteLength);
    const body = range ? buffer.subarray(range.start, range.end + 1) : buffer;
    return new Response(new Uint8Array(body), {
      status: range ? 206 : 200,
      headers: {
        "Content-Type": recording.contentType,
        "Content-Length": String(body.byteLength),
        "Accept-Ranges": "bytes",
        ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${buffer.byteLength}` } : {}),
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; recordingId: string }> },
) {
  try {
    assertSameOrigin(request);
    const actor = await requireSessionUser();
    const { id: pollId, recordingId } = await context.params;
    const { storedName } = await deleteDraftVoiceRecording(pollId, recordingId, actor);
    await deleteStoredVoiceRecording(storedName);
    return ok({ success: true });
  } catch (error) {
    return routeError(error);
  }
}
