import { NextRequest } from "next/server";
import { z } from "zod";
import { setSessionCookie } from "@/server/auth/session";
import { ensureDatabaseReady } from "@/server/db";
import { isMockModeEnabled } from "@/server/dingtalk";
import { DomainError } from "@/server/services/errors";
import { getUserById, listDemoUsers } from "@/server/services/users";
import { assertSameOrigin, ok, readJson, routeError } from "../../_lib/http";

const loginSchema = z.object({ userId: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    if (!isMockModeEnabled()) {
      throw new DomainError("NOT_FOUND", "演示登录未启用");
    }
    await ensureDatabaseReady();
    const { userId } = loginSchema.parse(await readJson(request));
    const user = await getUserById(userId);
    if (!user) throw new DomainError("NOT_FOUND", "演示用户不存在");

    await setSessionCookie(user);
    return ok({ user, mockMode: true, demoUsers: await listDemoUsers() });
  } catch (error) {
    return routeError(error);
  }
}
