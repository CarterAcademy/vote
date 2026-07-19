"use client";

import {
  FluentProvider,
  SSRProvider,
  createLightTheme,
  type BrandVariants,
  type Theme,
} from "@fluentui/react-components";
import type { ReactNode } from "react";
import { SessionProvider } from "@/lib/client/session";
import type { SessionPayload } from "@/lib/client/types";

const brand: BrandVariants = {
  10: "#001713",
  20: "#002923",
  30: "#003b33",
  40: "#00483f",
  50: "#005348",
  60: "#005e52",
  70: "#006458",
  80: "#00695c",
  90: "#19796b",
  100: "#3a8b7d",
  110: "#5da092",
  120: "#85b7ab",
  130: "#accfc6",
  140: "#cfe4de",
  150: "#e7f2ef",
  160: "#f5fbf9",
};

const baseTheme = createLightTheme(brand);
const appTheme: Theme = {
  ...baseTheme,
  fontFamilyBase:
    '"Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif',
  borderRadiusMedium: "10px",
  borderRadiusLarge: "12px",
};

export function AppProvider({
  children,
  initialSession,
}: {
  children: ReactNode;
  initialSession: SessionPayload;
}) {
  return (
    <SSRProvider>
      <FluentProvider theme={appTheme} style={{ minHeight: "100dvh" }}>
        <SessionProvider initialSession={initialSession}>{children}</SessionProvider>
      </FluentProvider>
    </SSRProvider>
  );
}
