import type { Metadata } from "next";
import { DemoLogin } from "@/components/DemoLogin";

export const metadata: Metadata = { title: "演示登录" };

export default function DemoPage() {
  return <DemoLogin />;
}

