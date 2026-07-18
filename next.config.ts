import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg", "pg-mem"],
  poweredByHeader: false,
};

export default nextConfig;
