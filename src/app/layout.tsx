import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppProvider } from "@/components/AppProvider";
import { getSessionUser } from "@/server/auth/session";
import { isMockModeEnabled } from "@/server/dingtalk";
import { listDemoUsers } from "@/server/services/users";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "两委会评审投票",
    template: "%s | 两委会评审投票",
  },
  description: "面向学术与技术委员会的钉钉评审投票平台，支持独立角色配置、定向投票与机器人提醒。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f4f6f5",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const mockMode = isMockModeEnabled();
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
