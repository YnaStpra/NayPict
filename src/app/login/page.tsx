"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, ShieldCheck, LogOut, LoaderCircle } from "lucide-react"
import { LoginForm } from "@/components/login/login-form"
import { login, logout } from "@/request/login"
import { userInfo as fetchUserInfo } from "@/request/user"
import { type LoginBo } from "@/server/entity/bo/login"
import { type UserInfoVo } from "@/server/entity/vo/user"
import { UserTypeEnum } from "@/server/enums/user-enum"
import { useApp } from "@/app/provider"
import { ThemeSwitcher } from "@/components/layout/theme-switcher"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"

import { toast } from "sonner"

export default function LoginPage() {
  const { userInfo, setUserInfo, title } = useApp()
  const [currentUser, setCurrentUser] = useState<UserInfoVo | null>(userInfo || null)
  const [checkingSession, setCheckingSession] = useState(!userInfo)
  const [showLoginForm, setShowLoginForm] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [loading, setLoading] = useState(false)
  const [require2Fa, setRequire2Fa] = useState(false)
  const [tempToken, setTempToken] = useState("")
  const router = useRouter()

  // Detect existing active session
  useEffect(() => {
    if (userInfo) {
      setCurrentUser(userInfo)
      setCheckingSession(false)
      return
    }

    fetchUserInfo()
      .then((info) => {
        if (info) {
          setCurrentUser(info)
          setUserInfo(info)
        }
      })
      .catch(() => {
        // Unauthenticated guest
      })
      .finally(() => {
        setCheckingSession(false)
      })
  }, [userInfo, setUserInfo])

  function handleLogin(params: LoginBo) {
    setLoading(true)

    login(params)
      .then((res) => {
        if (res?.require2Fa && res?.tempToken) {
          setRequire2Fa(true)
          setTempToken(res.tempToken)
          toast.info("Enter your 6-digit Google Authenticator code")
          return
        }

        if (res?.user) {
          setUserInfo(res.user)
          router.replace('/admin')
          return
        }
        return fetchUserInfo().then((info) => {
          if (info) {
            setUserInfo(info)
            router.replace('/admin')
          }
        })
      })
      .catch((err) => {
        console.error('Login failed:', err)
        toast.error(err?.message || "Login failed. Please check your credentials or 2FA code.")
      })
      .finally(() => {
        setLoading(false)
      })
  }

  function handleLogout() {
    setLoggingOut(true)
    logout()
      .then(() => {
        setUserInfo(null)
        setCurrentUser(null)
        setShowLoginForm(true)
        toast.success("Successfully signed out. You can now log in with another account.")
      })
      .catch((err) => {
        console.error("Logout failed:", err)
        toast.error("Failed to sign out. Please try again.")
      })
      .finally(() => {
        setLoggingOut(false)
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
        {checkingSession ? (
          <div className="flex h-64 items-center justify-center">
            <LoaderCircle className="size-7 animate-spin text-primary" />
          </div>
        ) : currentUser && !showLoginForm ? (
          /* Active session detected: Offer direct entrance to Admin or Sign Out / Switch */
          <Card className="shadow-xl shadow-black/10 border-border/80 backdrop-blur-md bg-card/95">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary shadow-inner">
                <ShieldCheck className="size-7" />
              </div>
              <CardTitle className="text-xl font-bold">
                Already Signed In
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed text-muted-foreground">
                You have an active session in <span className="font-semibold text-foreground">{title}</span>
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* User Identity Pill */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/60 border border-border/50">
                <Avatar size="default">
                  {currentUser.avatar ? (
                    <AvatarImage src={currentUser.avatar} alt={currentUser.username} />
                  ) : null}
                  <AvatarFallback className="font-bold text-xs bg-primary/15 text-primary">
                    {currentUser.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold truncate text-foreground">
                      {currentUser.username}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-primary/15 text-primary font-medium uppercase tracking-wider">
                      {currentUser.type === UserTypeEnum.ADMIN ? "Admin" : "Member"}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground truncate">
                    Authenticated session active
                  </span>
                </div>
              </div>

              {/* Primary Action Button: Enter Portal */}
              <Button
                className="w-full gap-2 font-medium cursor-pointer shadow-sm"
                onClick={() => router.push(currentUser.type === UserTypeEnum.ADMIN ? '/admin' : '/photos')}
              >
                <span>
                  {currentUser.type === UserTypeEnum.ADMIN ? 'Enter Admin Portal' : 'Enter Photo Gallery'}
                </span>
                <ArrowRight className="size-4" />
              </Button>

              {/* Secondary Action: Sign Out / Switch Account */}
              <Button
                variant="outline"
                className="w-full gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20 cursor-pointer"
                disabled={loggingOut}
                onClick={handleLogout}
              >
                {loggingOut ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <LogOut className="size-4" />
                )}
                <span>Sign Out / Switch Account</span>
              </Button>

              {/* Option to show form directly */}
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setShowLoginForm(true)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer hover:underline"
                >
                  Sign in with different credentials
                </button>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Login Form (with back button if user has active session) */
          <>
            {currentUser && (
              <button
                type="button"
                onClick={() => setShowLoginForm(false)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer self-start"
              >
                <ArrowLeft className="size-3.5" />
                <span>Back to active session ({currentUser.username})</span>
              </button>
            )}
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
          </>
        )}
      </div>
    </div>
  )
}
