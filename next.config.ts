import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is auth-gated and reads cookies, so it renders dynamically.
  // cacheComponents fights that model here, so it's left off.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
