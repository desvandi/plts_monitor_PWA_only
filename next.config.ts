import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// =============================================================================
// Next.js config — PLTS Monitor PWA
// -----------------------------------------------------------------------------
// CRITICAL FIXES (vs reference Remote-Relay):
//   - reactStrictMode: true  (reference disabled it; we restore it and make
//                            providers idempotent instead).
//   - typescript.ignoreBuildErrors: false  (fail build on TS errors).
//   - @serwist/next wraps the config to register a real service worker for
//     offline-capable PWA (reference had NO service worker).
// =============================================================================

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development" && !process.env.SERWIST_DEV,
  reloadOnOnline: true,
  cacheOnNavigation: true,
});

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
};

export default withSerwist(nextConfig);
