import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin pulls in Node-only modules; keep it out of the bundle.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
