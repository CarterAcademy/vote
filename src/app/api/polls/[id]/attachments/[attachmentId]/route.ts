import { requireSessionUser } from "@/server/auth/session";
import { readStoredAttachment } from "@/server/files/attachments";
import { getPollAttachment } from "@/server/services";
import { routeError } from "../../../../_lib/http";

export const runtime = "nodejs";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function contentDisposition(kind: "inline" | "attachment", filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function wordPreviewHtml(filename: string, text: string): string {
  const content = text
    ? `<pre>${escapeHtml(text)}</pre>`
    : '<div class="empty">该文档没有可提取的正文文字，请下载后使用 Word 查看完整内容。</div>';
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(filename)}</title><style>
html{background:#f4f6f5;color:#1f302a;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
body{max-width:850px;margin:0 auto;padding:28px 18px 60px}
.notice{margin-bottom:14px;color:#60716b;font-size:13px;line-height:1.6}
pre,.empty{min-height:60vh;margin:0;padding:36px 42px;border:1px solid #d9e0dd;border-radius:8px;background:#fff;box-shadow:0 8px 26px rgba(25,52,43,.06);font:15px/1.85 ui-serif,"Songti SC",SimSun,serif;white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:600px){body{padding:12px 8px 30px}pre,.empty{padding:22px 18px;border-radius:6px}}
</style></head><body><div class="notice">Word 在线预览以纯文本显示；复杂排版、批注和图片请下载原文件查看。</div>${content}</body></html>`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const actor = await requireSessionUser();
    const { id, attachmentId } = await context.params;
    const attachment = await getPollAttachment(id, attachmentId, actor);
    const preview = new URL(request.url).searchParams.get("preview") === "1";

    if (preview && attachment.contentType !== "application/pdf") {
      return new Response(wordPreviewHtml(attachment.name, attachment.previewText ?? ""), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "SAMEORIGIN",
        },
      });
    }

    const buffer = await readStoredAttachment(attachment.storedName);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": contentDisposition(preview ? "inline" : "attachment", attachment.name),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
