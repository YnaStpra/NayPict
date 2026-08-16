"use client"

import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react"
import { LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useApp } from "@/app/provider"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent, CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldGroup,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { type LoginBo } from "@/server/entity/bo/login"
import { useTranslations } from "next-intl"

interface LoginFormProps extends React.ComponentProps<"div"> {
  loading?: boolean
  onLogin: (params: LoginBo) => void
}

export function LoginForm({
  className,
  loading = false,
  onLogin,
  require2Fa = false,
  tempToken = "",
  onBackToLogin,
  ...props
}: LoginFormProps & {
  require2Fa?: boolean;
  tempToken?: string;
  onBackToLogin?: () => void;
}) {
  const t = useTranslations("login")
  const { title } = useApp()
  const [form, setForm] = useState<LoginBo>({
    username: "",
    password: "",
  })
  const [totpCode, setTotpCode] = useState("")

  useEffect(() => {
    const username = process.env.NEXT_PUBLIC_DEMO_USERNAME
    const password = process.env.NEXT_PUBLIC_DEMO_PASSWORD

    if (!username && !password) return

    setForm((prev) => ({
      username: username || prev.username,
      password: password || prev.password,
    }))
  }, [])

  function updateField(field: keyof LoginBo, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (require2Fa && tempToken) {
      onLogin({
        username: form.username.trim(),
        password: form.password,
        tempToken,
        code: totpCode.trim(),
      })
      return
    }

    onLogin({
      username: form.username.trim(),
      password: form.password,
    })
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="shadow-lg shadow-black/10">
        <CardHeader>
          <CardTitle className="text-xl font-semibold flex gap-3 items-center">
            <img
              src="/logo.png"
              alt=""
              className="size-10 object-contain"
            />
            {title} Admin Portal
          </CardTitle>
          <CardDescription>
            {require2Fa
              ? "Masukkan 6 digit kode dari aplikasi Google Authenticator Anda"
              : "Enter your admin credentials to manage your gallery"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitLogin}>
            {require2Fa ? (
              <FieldGroup>
                <Field>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Kode Verifikasi Google Authenticator (6 Digit)
                    </label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="000000"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                      className="bg-white/50 text-center tracking-[0.5em] text-lg font-mono"
                      autoFocus
                      required
                    />
                  </div>
                </Field>
                <Field className="mt-2 flex flex-col gap-2">
                  <Button type="submit" disabled={loading || totpCode.length !== 6}>
                    {loading && <LoaderCircle className="animate-spin mr-2" />}
                    Verifikasi & Masuk
                  </Button>
                  {onBackToLogin && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={onBackToLogin}
                      disabled={loading}
                    >
                      Kembali ke Login
                    </Button>
                  )}
                </Field>
              </FieldGroup>
            ) : (
              <FieldGroup>
                <Field>
                  <Input
                    type="text"
                    placeholder={t("username")}
                    value={form.username}
                    onChange={(event) => updateField("username", event.target.value)}
                    className="bg-white/50"
                    required
                  />
                </Field>
                <Field>
                  <Input
                    type="password"
                    placeholder={t("password")}
                    value={form.password}
                    onChange={(event) => updateField("password", event.target.value)}
                    className="bg-white/50"
                    required
                  />
                </Field>
                <Field className="mb-2">
                  <Button type="submit" disabled={loading}>
                    {loading && <LoaderCircle className="animate-spin" />}
                    {t("signIn")}
                  </Button>
                </Field>
              </FieldGroup>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
