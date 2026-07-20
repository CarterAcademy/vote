import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  const reportPath = path.join(
    process.cwd(),
    "docs",
    "investigation-summary.html",
  );
  const report = await readFile(reportPath);

  return new Response(report, {
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
