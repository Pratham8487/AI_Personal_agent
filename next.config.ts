import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Baileys is ESM-only and ships WAProto/WASM assets; load it natively in
  // the Node runtime instead of bundling it. pg and nodemailer pull optional
  // dynamic requires that must stay out of the bundler too.
  serverExternalPackages: ["baileys", "pg", "nodemailer"],
};

export default nextConfig;
