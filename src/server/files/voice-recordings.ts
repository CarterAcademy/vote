import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { DomainError } from "../services/errors";

export const MAX_VOICE_RECORDING_BYTES = 8 * 1024 * 1024;

const formatByContentType: Record<string, { extension: string; valid: (buffer: Buffer) => boolean }> = {
  "audio/webm": { extension: ".webm", valid: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
  "video/webm": { extension: ".webm", valid: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
  "audio/ogg": { extension: ".ogg", valid: (b) => b.subarray(0, 4).toString() === "OggS" },
  "audio/wav": { extension: ".wav", valid: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WAVE" },
  "audio/mp4": { extension: ".m4a", valid: (b) => b.subarray(4, 8).toString() === "ftyp" },
  "audio/mpeg": { extension: ".mp3", valid: (b) => b.subarray(0, 3).toString() === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  "audio/aac": { extension: ".aac", valid: (b) => b[0] === 0xff && (b[1] & 0xf6) === 0xf0 },
};

export interface PreparedVoiceRecording {
  id: string;
  storedName: string;
  contentType: string;
  sizeBytes: number;
  bytes: Buffer;
}

function storageDirectory(): string {
  const root = process.env.FILE_STORAGE_DIR?.trim() || path.join(process.cwd(), "uploads");
  return path.resolve(root, "voice-recordings");
}

export async function prepareVoiceRecording(file: File): Promise<PreparedVoiceRecording> {
  if (file.size <= 0) throw new DomainError("VALIDATION_ERROR", "没有收到有效的语音内容");
  if (file.size > MAX_VOICE_RECORDING_BYTES) {
    throw Object.assign(new DomainError("VALIDATION_ERROR", "语音内容过大，请缩短录音后重试"), { status: 413 });
  }
  const contentType = file.type.toLowerCase().split(";")[0];
  const format = formatByContentType[contentType];
  if (!format) throw Object.assign(new DomainError("VALIDATION_ERROR", "当前录音格式不受支持"), { status: 415 });
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength !== file.size || !format.valid(bytes)) {
    throw new DomainError("VALIDATION_ERROR", "录音内容与文件格式不匹配");
  }
  const id = randomUUID();
  return { id, storedName: `${id}${format.extension}`, contentType, sizeBytes: bytes.byteLength, bytes };
}

export async function storeVoiceRecording(recording: PreparedVoiceRecording): Promise<void> {
  await mkdir(storageDirectory(), { recursive: true, mode: 0o750 });
  await writeFile(path.join(storageDirectory(), recording.storedName), recording.bytes, {
    flag: "wx",
    mode: 0o600,
  });
}

export async function deleteStoredVoiceRecording(storedName: string): Promise<void> {
  await unlink(resolveStoredName(storedName)).catch(() => undefined);
}

export async function readStoredVoiceRecording(storedName: string): Promise<Buffer> {
  try {
    return await readFile(resolveStoredName(storedName));
  } catch {
    throw new DomainError("NOT_FOUND", "录音文件不存在");
  }
}

function resolveStoredName(storedName: string): string {
  if (!/^[0-9a-f-]{36}\.(webm|ogg|wav|m4a|mp3|aac)$/i.test(storedName)) {
    throw new DomainError("NOT_FOUND", "录音不存在");
  }
  return path.join(storageDirectory(), storedName);
}
