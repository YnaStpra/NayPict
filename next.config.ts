import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Extract the approved media gateway hostname for Next.js Image remote patterns.
function getMediaGatewayHostname(): string | null {
  const url = process.env.R2_MEDIA_GATEWAY_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const mediaGatewayHostname = getMediaGatewayHostname();

const nextConfig: NextConfig = {
  reactStrictMode: false,
  serverExternalPackages: ['exiftool-vendored', 'better-sqlite3'],
  // Always use standalone output for Docker/Render; Vercel ignores this setting.
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      // Allow derivatives served by the private-bucket media gateway.
      ...(mediaGatewayHostname
        ? [{ protocol: 'https' as const, hostname: mediaGatewayHostname }]
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
    // Global security headers applied to all routes (HIGH-04)
    const securityHeaders = [
      // Prevent clickjacking via iframes
      { key: 'X-Frame-Options', value: 'DENY' },
      // Prevent MIME-type sniffing
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      // Limit referrer information leakage
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // Disable browser features not required by this app
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
      // Force HTTPS (only meaningful in production behind HTTPS)
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      // HTTP/3 QUIC protocol advertisement and 0-RTT connection acceleration
      { key: 'Alt-Svc', value: 'h3=":443"; ma=86400, h3-29=":443"; ma=86400' },
      // Reporting API configuration for modern CSP violation reporting
      { key: 'Reporting-Endpoints', value: 'csp-endpoint="/api/csp-report"' },
      // Content Security Policy (CSP) mitigating XSS and data injection with active violation telemetry
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com",
          "frame-src 'self' https://challenges.cloudflare.com",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https: http:",
          "font-src 'self' data:",
          "connect-src 'self' https: wss: http: https://challenges.cloudflare.com",
          "frame-ancestors 'none'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "report-uri /api/csp-report",
          "report-to csp-endpoint",
        ].join('; '),
      },
    ];

    return [
      {
        source: '/:path*',
        headers: [
          ...securityHeaders,
          {
            key: 'Link',
            value: '</logo.webp>; rel=preload; as=image',
          },
        ],
      },
      {
        source: '/logo.webp',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/logo.png',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  compress: true,
};

export default withNextIntl(nextConfig);
