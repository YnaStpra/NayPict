"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { LoginForm } from "@/components/login/login-form"
import { login } from "@/request/login"
import { userInfo } from "@/request/user"
import { type LoginBo } from "@/server/entity/bo/login"
import { useApp } from "@/app/provider"
import { ThemeSwitcher } from "@/components/layout/theme-switcher"

import { toast } from "sonner"

export default function LoginPage() {
  const { setUserInfo } = useApp()
  const [loading, setLoading] = useState(false)
  const [require2Fa, setRequire2Fa] = useState(false)
  const [tempToken, setTempToken] = useState("")
  const router = useRouter()

  function handleLogin(params: LoginBo) {
    setLoading(true)

    login(params)
      .then((res) => {
        if (res?.require2Fa && res?.tempToken) {
          setRequire2Fa(true)
          setTempToken(res.tempToken)
          toast.info("Masukkan 6 digit kode Google Authenticator Anda")
          return
        }

        if (res?.user) {
          setUserInfo(res.user)
          router.replace('/admin')
          return
        }
        return userInfo().then((info) => {
          if (info) {
            setUserInfo(info)
            router.replace('/admin')
          }
        })
      })
      .catch((err) => {
        console.error('Login failed:', err)
        toast.error(err?.message || "Login gagal. Periksa kembali kredensial atau kode 2FA Anda.")
      })
      .finally(() => {
        setLoading(false)
      })
  }

  return (
    <div className="relative isolate flex min-h-screen w-full flex-col items-center justify-center gap-6 overflow-hidden bg-background p-4 sm:p-6 md:p-10">
      {/* Ambient gradient glow */}
      <div
        className="absolute inset-0 z-0 opacity-40 dark:opacity-20 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(circle at 30% 70%, rgba(99, 102, 241, 0.25), transparent 60%),
            radial-gradient(circle at 70% 30%, rgba(236, 72, 153, 0.2), transparent 60%)`,
        }}
      />

      {/* Top action bar: Back to Gallery & Theme Switcher */}
      <div className="relative z-10 w-full max-w-sm flex items-center justify-between">
        <Link
          href="/photos"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to Gallery</span>
        </Link>
        <div className="w-36">
          <ThemeSwitcher />
        </div>
      </div>

      <div className="relative z-10 flex w-full max-w-sm flex-col gap-6">
        <LoginForm
          loading={loading}
          onLogin={handleLogin}
          require2Fa={require2Fa}
          tempToken={tempToken}
          onBackToLogin={() => {
            setRequire2Fa(false)
            setTempToken("")
          }}
        />
      </div>
    </div>
  )
}
