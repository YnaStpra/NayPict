import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const nextConfig: NextConfig = {
  reactStrictMode: false,
  serverExternalPackages: ['exiftool-vendored', 'better-sqlite3'],
  // Vercel Need not standalone；Docker Only required for self-built deployment。
  output: process.env.VERCEL ? undefined : 'standalone',
  // Windows standalone It is necessary to incorporate native dependent resources into the product。
  ...(process.platform === "win32"
    ? {
        outputFileTracingIncludes: {
          "/**": [
            "./node_modules/@img/sharp-win32-x64/**/*",
            "./node_modules/exiftool-vendored.exe/**/*",
          ],
        },
        typescript: {
          // Windows Skip when packaging locally TypeScript type checking。
          ignoreBuildErrors: true,
        },
      }
    : {}),
  async headers() {
    return [
      {
        source: '/logo.png',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800',
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
