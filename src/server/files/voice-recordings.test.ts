import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  deleteStoredVoiceRecording,
  prepareVoiceRecording,
  readStoredVoiceRecording,
  storeVoiceRecording,
} from "./voice-recordings";

let temporaryDirectory = "";

function makeFile(bytes: number[], type: string): File {
  const buffer = Buffer.from(bytes);
  return {
    name: "voice.webm",
    type,
    size: buffer.byteLength,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  } as File;
}

describe("private voice recording storage", () => {
  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), "committee-vote-voice-"));
    process.env.FILE_STORAGE_DIR = temporaryDirectory;
  });

  afterEach(async () => {
    delete process.env.FILE_STORAGE_DIR;
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("validates, stores, reads and deletes a WebM recording", async () => {
    const file = makeFile([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02], "audio/webm;codecs=opus");
    const recording = await prepareVoiceRecording(file);
    await storeVoiceRecording(recording);

    expect(await readdir(path.join(temporaryDirectory, "voice-recordings")))
      .toEqual([recording.storedName]);
    expect(await readStoredVoiceRecording(recording.storedName)).toEqual(recording.bytes);

    await deleteStoredVoiceRecording(recording.storedName);
    expect(await readdir(path.join(temporaryDirectory, "voice-recordings"))).toEqual([]);
  });

  it("rejects audio whose signature does not match its MIME type", async () => {
    await expect(prepareVoiceRecording(makeFile([1, 2, 3, 4], "audio/webm")))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
