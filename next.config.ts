import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    serverActions: {
      // Matches the 25MB cap enforced in server actions for document/file
      // uploads (see MAX_UPLOAD_BYTES in src/actions/documents.ts).
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
