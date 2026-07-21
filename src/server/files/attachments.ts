import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import WordExtractor from "word-extractor";

import { DomainError } from "../services/errors";

export const MAX_ATTACHMENT_COUNT = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = MAX_ATTACHMENT_COUNT * MAX_ATTACHMENT_BYTES + 1024 * 1024;

const WORD_PREVIEW_CHARACTER_LIMIT = 250_000;
const allowedExtensions = new Set([".pdf", ".doc", ".docx"]);

const contentTypeByExtension: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export interface PreparedPollAttachment {
  id: string;
  originalName: string;
  storedName: string;
  contentType: string;
  sizeBytes: number;
  previewText: string | null;
  displayOrder: number;
}

function storageDirectory(): string {
  return path.resolve(process.env.FILE_STORAGE_DIR?.trim() || path.join(process.cwd(), "uploads"));
}

function safeOriginalName(name: string): string {
  const cleaned = path.basename(name).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!cleaned || cleaned.length > 255) {
    throw new DomainError("VALIDATION_ERROR", "附件文件名无效或超过 255 个字符");
  }
  return cleaned;
}

function hasSignature(buffer: Buffer, signature: number[]): boolean {
  return signature.every((value, index) => buffer[index] === value);
}

function validateSignature(extension: string, buffer: Buffer): void {
  const valid = extension === ".pdf"
    ? hasSignature(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])
    : extension === ".doc"
      ? hasSignature(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
      : hasSignature(buffer, [0x50, 0x4b]);
  if (!valid) {
    throw new DomainError("VALIDATION_ERROR", "附件内容与 PDF/DOC/DOCX 文件格式不匹配");
  }
}

async function extractWordPreview(buffer: Buffer): Promise<string> {
  try {
    const document = await new WordExtractor().extract(buffer);
    const text = document.getBody().replace(/\r\n?/g, "\n").trim();
    return text.slice(0, WORD_PREVIEW_CHARACTER_LIMIT);
  } catch {
    throw new DomainError("VALIDATION_ERROR", "Word 附件无法读取，请确认文件未损坏或加密");
  }
}

export async function preparePollAttachments(files: File[]): Promise<PreparedPollAttachment[]> {
  if (files.length > MAX_ATTACHMENT_COUNT) {
    throw new DomainError("VALIDATION_ERROR", `每场投票最多上传 ${MAX_ATTACHMENT_COUNT} 个附件`);
  }

  const prepared: PreparedPollAttachment[] = [];
  await mkdir(storageDirectory(), { recursive: true, mode: 0o750 });

  try {
    for (const [displayOrder, file] of files.entries()) {
      const originalName = safeOriginalName(file.name);
      const extension = path.extname(originalName).toLowerCase();
      if (!allowedExtensions.has(extension)) {
        throw new DomainError("VALIDATION_ERROR", "附件仅支持 PDF、DOC 和 DOCX 格式");
      }
      if (file.size <= 0) {
        throw new DomainError("VALIDATION_ERROR", `${originalName} 是空文件`);
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        throw new DomainError("VALIDATION_ERROR", `${originalName} 超过 10 MB 大小限制`);
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      validateSignature(extension, buffer);
      const previewText = extension === ".pdf" ? null : await extractWordPreview(buffer);
      const id = randomUUID();
      const storedName = `${id}${extension}`;
      await writeFile(path.join(storageDirectory(), storedName), buffer, { flag: "wx", mode: 0o600 });
      prepared.push({
        id,
        originalName,
        storedName,
        contentType: contentTypeByExtension[extension],
        sizeBytes: buffer.byteLength,
        previewText,
        displayOrder,
      });
    }
    return prepared;
  } catch (error) {
    await cleanupPollAttachments(prepared);
    throw error;
  }
}

export async function cleanupPollAttachments(attachments: PreparedPollAttachment[]): Promise<void> {
  await Promise.all(
    attachments.map((attachment) =>
      unlink(path.join(storageDirectory(), attachment.storedName)).catch(() => undefined),
    ),
  );
}

export async function readStoredAttachment(storedName: string): Promise<Buffer> {
  if (!/^[0-9a-f-]{36}\.(pdf|doc|docx)$/i.test(storedName)) {
    throw new DomainError("NOT_FOUND", "附件不存在");
  }
  try {
    return await readFile(path.join(storageDirectory(), storedName));
  } catch {
    throw new DomainError("NOT_FOUND", "附件文件不存在");
  }
}
