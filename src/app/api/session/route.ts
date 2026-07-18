import { getSessionUser } from "@/server/auth/session";
import { ensureDatabaseReady } from "@/server/db";
import { listDemoUsers } from "@/server/services/users";
import { ok, routeError } from "../_lib/http";

export async function GET() {
  try {
    await ensureDatabaseReady();
    const user = await getSessionUser();
    const mockMode =
      process.env.DINGTALK_MOCK_ENABLED === "true" &&
      process.env.NODE_ENV !== "production";
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
