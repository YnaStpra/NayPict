import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Extract R2 public URL hostname for Next.js Image remote patterns.
function getR2Hostname(): string | null {
  const url = process.env.R2_PUBLIC_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const r2Hostname = getR2Hostname();

const nextConfig: NextConfig = {
  reactStrictMode: false,
  serverExternalPackages: ['exiftool-vendored', 'better-sqlite3'],
  // Always use standalone output for Docker/Render; Vercel ignores this setting.
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      // Allow images served from Cloudflare R2 public URL.
      ...(r2Hostname
        ? [{ protocol: 'https' as const, hostname: r2Hostname }]
        : []),
    ],
  },
  ...(process.platform === "win32"
    ? {
        outputFileTracingIncludes: {
          "/**": [
            "./node_modules/@img/sharp-win32-x64/**/*",
            "./node_modules/exiftool-vendored.exe/**/*",
          ],
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
