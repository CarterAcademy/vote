import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg", "pg-mem", "word-extractor"],
  poweredByHeader: false,
};

export default nextConfig;
