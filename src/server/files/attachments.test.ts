import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { cleanupPollAttachments, preparePollAttachments } from "./attachments";

let temporaryDirectory = "";

function makeFile(content: string, name: string, type = ""): File {
  const buffer = Buffer.from(content);
  return {
    name,
    type,
    size: buffer.byteLength,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  } as File;
}

describe("poll attachment storage", () => {
  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), "committee-vote-attachments-"));
    process.env.FILE_STORAGE_DIR = temporaryDirectory;
  });

  afterEach(async () => {
    delete process.env.FILE_STORAGE_DIR;
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("stores a valid PDF under a generated private name", async () => {
    const file = makeFile("%PDF-1.4\n%%EOF", "评审材料.pdf", "application/pdf");

    const attachments = await preparePollAttachments([file]);
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      originalName: "评审材料.pdf",
      contentType: "application/pdf",
      previewText: null,
      displayOrder: 0,
    });
    expect(await readdir(temporaryDirectory)).toEqual([attachments[0].storedName]);

    await cleanupPollAttachments(attachments);
    expect(await readdir(temporaryDirectory)).toEqual([]);
  });

  it("rejects extensions outside the allowlist", async () => {
    const file = makeFile("content", "malware.exe");
    await expect(preparePollAttachments([file])).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects a renamed file whose signature does not match", async () => {
    const file = makeFile("not a real PDF", "renamed.pdf", "application/pdf");
    await expect(preparePollAttachments([file])).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});
