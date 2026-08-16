"use client"

import { useLayoutEffect, useState } from "react"
import { useRouter, useServerInsertedHTML } from "next/navigation"
import { LoginForm } from "@/components/login/login-form"
import { login } from "@/request/login"
import { userInfo } from "@/request/user"
import { type LoginBo } from "@/server/entity/bo/login"
import { useApp } from "@/app/provider"

import { toast } from "sonner"

export default function LoginPage() {
  const { refreshAlbums, refreshStorages, setUserInfo, theme, setTheme } = useApp()
  const [loading, setLoading] = useState(false)
  const [require2Fa, setRequire2Fa] = useState(false)
  const [tempToken, setTempToken] = useState("")
  const router = useRouter()

  useServerInsertedHTML(() => (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){var el=document.documentElement;el.classList.remove("dark");el.style.colorScheme="light";})();`,
      }}
    />
  ))

  useLayoutEffect(() => {
    document.documentElement.classList.remove("dark")
    document.documentElement.style.colorScheme = "light"
    return () => {
      setTheme(theme)
    }
  }, [])

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

        if (res?.token) {
          // Token set in HTTP-only cookie by server
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
    <div className="relative isolate flex min-h-screen w-full flex-col items-center justify-center gap-6 overflow-hidden bg-[#fefcff] p-6 md:p-10">
      {/* Dreamy Sky Pink Glow */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `
            radial-gradient(circle at 30% 70%, rgba(173, 216, 230, 0.35), transparent 60%),
            radial-gradient(circle at 70% 30%, rgba(255, 182, 193, 0.4), transparent 60%)`,
        }}
      />
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
