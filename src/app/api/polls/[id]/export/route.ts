import { requireHr } from "@/server/auth/session";
import { ensureDatabaseReady } from "@/server/db";
import { exportPollToExcel } from "@/server/services";
import { routeError } from "../../../_lib/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await ensureDatabaseReady();
    const actor = await requireHr();
    const { id } = await context.params;
    const exported = await exportPollToExcel(id, actor);
    return new Response(exported.buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(exported.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
