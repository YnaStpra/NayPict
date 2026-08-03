import { type Metadata } from "next"
import { getTranslations } from "next-intl/server"

// Generate landing page metadata based on current language。
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("login")
  const appName = process.env.TITLE || "Pixtale"

  return {
    title: t("metaTitle", { appName }),
    description: t("metaDescription", { appName }),
    robots: {
      index: false,
      follow: false,
    },
  }
}

interface LoginLayoutProps {
  children: React.ReactNode
}

// Login page layout，Only pass through child nodes and provide page metadata。
export default function LoginLayout({ children }: LoginLayoutProps) {
  return children
}
