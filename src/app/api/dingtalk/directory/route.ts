import { NextRequest } from "next/server";
import { z } from "zod";
import { requireHr } from "@/server/auth/session";
import { getDingTalkGateway } from "@/server/dingtalk";
import { DomainError } from "@/server/services/errors";
import { ok, routeError } from "../../_lib/http";

const directoryQuerySchema = z.object({
  departmentId: z.coerce.number().int().positive().safe().default(1),
  cursor: z.coerce.number().int().min(0).safe().default(0),
  query: z.string().trim().min(1).max(100).optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireHr();
    const query = directoryQuerySchema.parse({
      departmentId: request.nextUrl.searchParams.get("departmentId") ?? undefined,
      cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
      query: request.nextUrl.searchParams.get("query") ?? undefined,
    });

    try {
      if (query.query) {
        return ok(await getDingTalkGateway().searchDirectoryUsers(
          query.query,
          query.cursor,
        ));
      }
      return ok(await getDingTalkGateway().listDirectory(
        query.departmentId,
        query.cursor,
      ));
    } catch (error) {
      console.error("DingTalk directory lookup failed", error);
      throw new DomainError(
        "DINGTALK_ERROR",
        query.query
          ? "无法搜索钉钉企业通讯录，请检查应用通讯录权限后重试"
          : "无法读取钉钉企业通讯录，请检查应用通讯录权限后重试",
      );
    }
  } catch (error) {
    return routeError(error);
  }
}
