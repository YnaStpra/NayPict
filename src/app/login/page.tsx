"use client"

import { useLayoutEffect, useState } from "react"
import { useRouter, useServerInsertedHTML } from "next/navigation"
import { LoginForm } from "@/components/login/login-form"
import { login } from "@/request/login"
import { userInfo } from "@/request/user"
import { type LoginBo } from "@/server/entity/bo/login"
import { useApp } from "@/app/provider"

export default function LoginPage() {
  const { refreshAlbums, refreshStorages, setUserInfo, theme, setTheme } = useApp()
  // loading Flag whether the login request is being submitted。
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useServerInsertedHTML(() => (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){var el=document.documentElement;el.classList.remove("dark");el.style.colorScheme="light";})();`,
      }}
    />
  ))

  // Enter login page to force bright color，Restore the user's saved default theme when leaving。
  useLayoutEffect(() => {
    document.documentElement.classList.remove("dark")
    document.documentElement.style.colorScheme = "light"
    return () => {
      setTheme(theme)
    }
  }, [])

  // Request login interface，After success, pull the current user information and jump to the photo page。
  function handleLogin(params: LoginBo) {
    setLoading(true)

    login(params)
      .then(() => userInfo())
      .then((info) => {
        if (info) {
          setUserInfo(info)
          router.replace("/admin")
          void refreshAlbums()
          void refreshStorages()
        }
      })
      .catch((err) => {
        console.error("Login failed:", err)
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
        <LoginForm loading={loading} onLogin={handleLogin} />
      </div>
    </div>
  )
}
