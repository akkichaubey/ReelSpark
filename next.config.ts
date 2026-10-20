import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@remotion/bundler',
    '@remotion/renderer',
    'remotion',
    'gsap',
  ],
  experimental: {
    proxyClientMaxBodySize: '500mb',
  },
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
