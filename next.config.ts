import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "megajs", "@aws-sdk/client-s3", "@aws-sdk/lib-storage"],
  poweredByHeader: false,
  compress: true,
};

export default nextConfig;
