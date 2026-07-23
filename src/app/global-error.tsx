"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("应用加载失败", error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: '"Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif' }}>
        <main style={{ display: "grid", minHeight: "100dvh", padding: 20, background: "#f4f6f5", placeItems: "center" }}>
          <section
            role="alert"
            aria-labelledby="global-error-title"
            style={{ display: "grid", width: "min(560px, 100%)", boxSizing: "border-box", padding: 36, border: "1px solid #d9dfdc", borderRadius: 18, background: "#fff", color: "#1d2723", gap: 16 }}
          >
            <span aria-hidden="true" style={{ display: "grid", width: 48, height: 48, borderRadius: 12, background: "#00695c", color: "#fff", fontSize: 20, fontWeight: 700, placeItems: "center" }}>评</span>
            <p style={{ margin: 0, color: "#005348", fontSize: 13, fontWeight: 700 }}>系统暂时不可用</p>
            <h1 id="global-error-title" style={{ margin: 0, fontSize: 30 }}>应用没有成功加载</h1>
            <p style={{ margin: 0, color: "#52615b", lineHeight: 1.7 }}>系统没有展示内部错误信息。请重新尝试；如果问题持续存在，请联系管理员。</p>
            <div style={{ display: "flex", marginTop: 8, gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={reset} style={{ minHeight: 44, padding: "0 18px", border: 0, borderRadius: 10, background: "#00695c", color: "#fff", cursor: "pointer", font: "inherit", fontWeight: 650 }}>重新加载</button>
              <Link href="/" style={{ display: "inline-flex", minHeight: 44, alignItems: "center", padding: "0 18px", border: "1px solid #b7c2bd", borderRadius: 10, color: "#1d2723", fontWeight: 650, textDecoration: "none" }}>返回首页</Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
