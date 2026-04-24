import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Matches the 25MB cap enforced in server actions for document/file
      // uploads (see MAX_UPLOAD_BYTES in src/actions/documents.ts).
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
