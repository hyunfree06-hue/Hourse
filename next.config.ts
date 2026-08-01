import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp"],
  images: {
    remotePatterns: [],
  },
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
