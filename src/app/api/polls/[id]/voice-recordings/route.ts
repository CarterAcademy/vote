import { NextRequest } from "next/server";

import { requireSessionUser } from "@/server/auth/session";
import { ensureDatabaseReady } from "@/server/db";
import {
  deleteStoredVoiceRecording,
  MAX_VOICE_RECORDING_BYTES,
  prepareVoiceRecording,
  storeVoiceRecording,
} from "@/server/files/voice-recordings";
import { transcribeAudio } from "@/server/llm/transcription";
import { getEligiblePollVoter, prepareVoiceRecordingSlot } from "@/server/services";
import { assertSameOrigin, ok, routeError } from "../../../_lib/http";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  let storedName: string | null = null;
  try {
    assertSameOrigin(request);
    const actor = await requireSessionUser();
    const { id: pollId } = await context.params;
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_VOICE_RECORDING_BYTES + 64 * 1024) {
      throw Object.assign(new Error("语音内容过大，请缩短录音后重试"), { status: 413, code: "AUDIO_TOO_LARGE" });
    }
    const pollVoterId = await getEligiblePollVoter(pollId, actor);
    const expiredFiles = await prepareVoiceRecordingSlot(pollId, pollVoterId, actor);
    await Promise.all(expiredFiles.map((name) => deleteStoredVoiceRecording(name)));
    const formData = await request.formData();
    const audio = formData.get("audio");
    if (!(audio instanceof File)) {
      throw Object.assign(new Error("没有收到有效的语音内容"), { status: 400, code: "INVALID_AUDIO" });
    }
    const prepared = await prepareVoiceRecording(audio);
    const transcript = await transcribeAudio({
      bytes: prepared.bytes,
      contentType: prepared.contentType,
    });
    await storeVoiceRecording(prepared);
    storedName = prepared.storedName;
    const db = await ensureDatabaseReady();
    const createdAt = new Date();
    await db.insertInto("vote_voice_recordings").values({
      id: prepared.id,
      poll_id: pollId,
      poll_voter_id: pollVoterId,
      vote_id: null,
      created_by_user_id: actor.id,
      stored_name: prepared.storedName,
      content_type: prepared.contentType,
      size_bytes: prepared.sizeBytes,
      transcript,
      status: "DRAFT",
      is_active: false,
      submitted_version: null,
      created_at: createdAt,
    }).execute();
    return ok({
      recording: {
        id: prepared.id,
        transcript,
        contentType: prepared.contentType,
        sizeBytes: prepared.sizeBytes,
        submitted: false,
        createdAt: createdAt.toISOString(),
      },
    }, 201);
  } catch (error) {
    if (storedName) await deleteStoredVoiceRecording(storedName);
    return routeError(error);
  }
}
