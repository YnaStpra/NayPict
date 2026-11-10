import { Geist } from "next/font/google"
import { type Metadata, type Viewport } from "next"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"

import { Provider } from "@/app/provider"
import { PwaRegister } from "@/components/pwa/pwa-register"
import { SmoothScrollProvider } from "@/components/providers/smooth-scroll-provider"
import { InstantPageProvider } from "@/components/providers/instant-page-provider"
import "./globals.css"

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
  preload: true,
  adjustFontFallback: true,
})

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  interactiveWidget: "resizes-visual",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
  ],
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: process.env.TITLE || "NayPict",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: process.env.TITLE || "NayPict",
    },
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/naypict-icon.svg", type: "image/svg+xml" },
        { url: "/naypict-icon-32x32.png", sizes: "32x32", type: "image/png" },
        { url: "/naypict-icon-192x192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: [
        { url: "/naypict-icon-512x512.png", sizes: "512x512", type: "image/png" },
      ],
      shortcut: "/favicon.ico",
    },
  }
}

interface RootLayoutProps {
  children: React.ReactNode
}

// Render application root layout with zero serverless DB queries to maximize Vercel Edge caching.
export default async function RootLayout({ children }: RootLayoutProps) {
  const title = process.env.TITLE || "NayPict"
  const [locale, messages] = await Promise.all([getLocale(), getMessages()])

  // Extract media gateway and storage origins for DNS prefetch and preconnect acceleration without DB overhead.
  const candidateUrls = [
    process.env.NEXT_PUBLIC_MEDIA_GATEWAY_URL,
    process.env.R2_MEDIA_GATEWAY_URL,
    process.env.S3_ENDPOINT,
    process.env.NEXT_PUBLIC_S3_ENDPOINT,
    process.env.STORAGE_DOMAIN,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
  ]
  const preconnectOrigins = new Set<string>()

  for (const rawUrl of candidateUrls) {
    if (!rawUrl) continue
    try {
      const formatted = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`
      preconnectOrigins.add(new URL(formatted).origin)
    } catch {}
  }

  return (
    <html lang={locale} className={`${geist.variable} dark`} suppressHydrationWarning>
      <head>
        {/* Instant zero-FOUC theme resolution before browser paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||(document.cookie.match(/theme=([^;]+)/)||[])[1]||'dark';if(t==='light'){document.documentElement.classList.remove('dark');document.documentElement.classList.add('light');}else{document.documentElement.classList.remove('light');document.documentElement.classList.add('dark');}}catch(e){}})()`,
          }}
        />
        {Array.from(preconnectOrigins).flatMap((origin) => [
          <link key={`dns-${origin}`} rel="dns-prefetch" href={origin} />,
          <link key={`pre-${origin}`} rel="preconnect" href={origin} crossOrigin="anonymous" />,
        ])}
        <link rel="preload" href="/worklets/smooth-corners.js" as="script" />
        <link rel="preload" href="/worklets/skeleton-shimmer.js" as="script" />
        <script
          dangerouslySetInnerHTML={{
            __html: `if(typeof CSS!=='undefined'&&'paintWorklet' in CSS){try{CSS.paintWorklet.addModule('/worklets/smooth-corners.js');CSS.paintWorklet.addModule('/worklets/skeleton-shimmer.js')}catch(e){}}`,
          }}
        />
        {/* Speculation Rules API: Native Chromium 0ms instant prerender and prefetch */}
        <script
          type="speculationrules"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              prerender: [
                {
                  source: "list",
                  urls: ["/photos", "/albums", "/map"],
                  eagerness: "moderate",
                },
              ],
              prefetch: [
                {
                  source: "list",
                  urls: ["/photos", "/albums", "/map", "/archive", "/insights", "/comments"],
                  eagerness: "conservative",
                },
              ],
            }),
          }}
        />
      </head>
      <body>
        <PwaRegister />
        <NextIntlClientProvider messages={messages}>
          <Provider
            defaultTheme="dark"
            defaultSidebarOpen={true}
            initialUserInfo={null}
            title={title}
          >
            <SmoothScrollProvider>
              <InstantPageProvider>
                {children}
              </InstantPageProvider>
            </SmoothScrollProvider>
          </Provider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
