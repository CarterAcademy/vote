import { getSessionUser } from "@/server/auth/session";
import { ensureDatabaseReady } from "@/server/db";
import { isMockModeEnabled } from "@/server/dingtalk";
import { listDemoUsers } from "@/server/services/users";
import { ok, routeError } from "../_lib/http";

export async function GET() {
  try {
    await ensureDatabaseReady();
    const user = await getSessionUser();
    const mockMode = isMockModeEnabled();
    const demoUsers = mockMode ? await listDemoUsers() : undefined;
    return ok({
      user,
      mockMode,
      demoUsers,
      corpId: mockMode ? undefined : process.env.DINGTALK_CORP_ID,
    });
  } catch (error) {
    return routeError(error);
  }
}
