import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    remotePatterns: [],
  },
};

export default config;
