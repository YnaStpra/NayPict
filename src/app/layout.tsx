import { cookies } from "next/headers"
import { Geist } from "next/font/google"
import { type Metadata, type Viewport } from "next"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"

import { Provider, type Theme } from "@/app/provider"
import { getLoginInfo } from "@/lib/cookie"
import { userService } from "@/server/service/user-service"
import "./globals.css"

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
})

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const THEME_COOKIE_NAME = "theme"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
  ],
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: process.env.TITLE || "NayPict",
    icons: {
      icon: "/logo.png",
      apple: "/logo.png",
    },
  }
}

interface RootLayoutProps {
  children: React.ReactNode
}

// Render application root layout，and restore the saved theme before the page is painted。
export default async function RootLayout({ children }: RootLayoutProps) {

  const cookieStore = await cookies()
  const defaultTheme: Theme = cookieStore.get(THEME_COOKIE_NAME)?.value === "light" ? "light" : "dark"
  const defaultSidebarOpen = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value === "true"
  const { userId } = await getLoginInfo(cookieStore.toString())
  const userInfo = userId ? await userService.getById(userId) : null
  const title = process.env.TITLE || "NayPict"
  const [locale, messages] = await Promise.all([getLocale(), getMessages()])

  // Extract CDN origin for DNS prefetch and preconnect acceleration
  const cdnOrigin = process.env.R2_PUBLIC_URL ? (() => {
    try {
      return new URL(process.env.R2_PUBLIC_URL).origin
    } catch {
      return null
    }
  })() : null

  return (
    <html lang={locale} className={`${geist.variable} ${defaultTheme}`} suppressHydrationWarning>
      <head>
        {cdnOrigin && (
          <>
            <link rel="dns-prefetch" href={cdnOrigin} />
            <link rel="preconnect" href={cdnOrigin} crossOrigin="anonymous" />
          </>
        )}
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <Provider
            defaultTheme={defaultTheme}
            defaultSidebarOpen={defaultSidebarOpen}
            initialUserInfo={userInfo}
            title={title}
          >
            {children}
          </Provider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
