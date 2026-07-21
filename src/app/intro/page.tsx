import type { Metadata } from "next";
import { ProductLanding } from "@/components/ProductLanding";

export const metadata: Metadata = {
  title: "产品介绍",
  description: "了解两委会评审投票平台的角色权限、投票入口、语音意见和投票规则。",
};

export default function ProductIntroPage() {
  return <ProductLanding />;
}
