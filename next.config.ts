import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Baileys is ESM-only and ships WAProto/WASM assets; load it natively in
  // the Node runtime instead of bundling it.
  serverExternalPackages: ["baileys"],
};

export default nextConfig;
