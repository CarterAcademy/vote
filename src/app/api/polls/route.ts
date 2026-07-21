import { NextRequest } from "next/server";
import { requireHr, requireSessionUser } from "@/server/auth/session";
import { ensureDatabaseReady } from "@/server/db";
import { createPoll, listPolls } from "@/server/services";
import { createPollSchema, pollListQuerySchema } from "@/server/validation";
import {
  cleanupPollAttachments,
  MAX_UPLOAD_BYTES,
  preparePollAttachments,
} from "@/server/files/attachments";
import { assertSameOrigin, ok, readJson, routeError } from "../_lib/http";

export async function GET(request: NextRequest) {
  try {
    await ensureDatabaseReady();
    const actor = await requireSessionUser();
    const query = pollListQuerySchema.parse({
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      search: request.nextUrl.searchParams.get("q") ?? undefined,
      committeeId: request.nextUrl.searchParams.get("committeeId") ?? undefined,
      from: request.nextUrl.searchParams.get("from") ?? undefined,
      to: request.nextUrl.searchParams.get("to") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined,
      scope: request.nextUrl.searchParams.get("scope") ?? undefined,
    });
    const result = await listPolls(query, actor);
    return ok(result);
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: NextRequest) {
  let preparedAttachments: Awaited<ReturnType<typeof preparePollAttachments>> = [];
  try {
    assertSameOrigin(request);
    await ensureDatabaseReady();
    const actor = await requireHr();
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      const input = createPollSchema.parse(await readJson(request));
      return ok({ poll: await createPoll(input, actor) }, 201);
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_UPLOAD_BYTES) {
      throw Object.assign(new Error("上传内容过大，每个附件不能超过 10 MB"), {
        status: 413,
        code: "PAYLOAD_TOO_LARGE",
      });
    }
    const formData = await request.formData();
    const input = createPollSchema.parse({
      committeeId: formData.get("committeeId"),
      title: formData.get("title"),
      candidateName: formData.get("candidateName"),
      startsAt: formData.get("startsAt") || undefined,
      deadlineAt: formData.get("deadlineAt"),
    });
    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File && Boolean(entry.name));
    preparedAttachments = await preparePollAttachments(files);
    const poll = await createPoll(input, actor, preparedAttachments);
    return ok({ poll }, 201);
  } catch (error) {
    if (preparedAttachments.length > 0) {
      await cleanupPollAttachments(preparedAttachments);
    }
    return routeError(error);
  }
}
