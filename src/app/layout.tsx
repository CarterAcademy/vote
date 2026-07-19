import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppProvider } from "@/components/AppProvider";
import { getSessionUser } from "@/server/auth/session";
import { listDemoUsers } from "@/server/services/users";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "两委会评审投票",
    template: "%s | 两委会评审投票",
  },
  description: "中关村两院两委会人选评审投票系统",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f4f6f5",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const mockMode =
    process.env.DINGTALK_MOCK_ENABLED === "true" &&
    process.env.NODE_ENV !== "production";
  const [user, demoUsers] = await Promise.all([
    getSessionUser(),
    mockMode ? listDemoUsers() : Promise.resolve([]),
  ]);

  return (
    <html lang="zh-CN">
      <body>
        <AppProvider
          initialSession={{
            user,
            mockMode,
            demoUsers,
            corpId: mockMode ? null : process.env.DINGTALK_CORP_ID ?? null,
          }}
        >
          {children}
        </AppProvider>
      </body>
    </html>
  );
}
