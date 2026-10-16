"use client"

import { useEffect, useState } from "react"
import { ShieldCheck, ShieldAlert, QrCode, Copy, Check, LoaderCircle, KeyRound, Smartphone, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SettingItem } from "@/components/setting/setting-item"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { disableTotp, enableTotp, getTotpStatus, setupTotp } from "@/request/totp"
import { type TotpSetupVo, type TotpStatusVo } from "@/server/entity/vo/totp"
import { useModalBackHandler } from "@/hooks/use-modal-back-handler"
import { humanizeError } from "@/lib/error-formatter"
import { cn } from "@/lib/utils"

export function TotpSettingsCard() {
  const [status, setStatus] = useState<TotpStatusVo>({ enabled: false, configured: false })
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [setupData, setSetupData] = useState<TotpSetupVo | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [verificationCode, setVerificationCode] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [copiedSecret, setCopiedSecret] = useState(false)

  // Disable 2FA Re-authentication Modal State
  const [disableDialogOpen, setDisableDialogOpen] = useState(false)
  const [disableMethod, setDisableMethod] = useState<"password" | "code">("password")
  const [disablePassword, setDisablePassword] = useState("")
  const [disableCode, setDisableCode] = useState("")
  const [submittingDisable, setSubmittingDisable] = useState(false)

  // Intercept Android / mobile back gesture to close modals cleanly
  useModalBackHandler(dialogOpen, setDialogOpen)
  useModalBackHandler(disableDialogOpen, setDisableDialogOpen)

  // Fetch current 2FA status on mount
  useEffect(() => {
    fetchStatus()
  }, [])

  function fetchStatus() {
    setLoadingStatus(true)
    getTotpStatus()
      .then((res: TotpStatusVo) => {
        if (res) setStatus(res)
      })
      .catch((err: Error) => {
        console.error("Failed to fetch TOTP status:", err)
      })
      .finally(() => {
        setLoadingStatus(false)
      })
  }

  // Open 2FA setup dialog and fetch fresh QR code + secret key
  function handleOpenSetup() {
    setSubmitting(true)
    setupTotp()
      .then((res) => {
        if (res) {
          setSetupData(res)
          setVerificationCode("")
          setDialogOpen(true)
        }
      })
      .catch((err) => {
        if (!err?.__toastShown) {
          toast.error(humanizeError(err?.message || "Failed to set up Google Authenticator."))
        }
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  // Submit 6-digit verification code to enable 2FA
  function handleEnable2Fa() {
    if (!setupData || verificationCode.length !== 6) return
    setSubmitting(true)

    enableTotp({
      secret: setupData.secret,
      code: verificationCode.trim(),
    })
      .then(() => {
        toast.success("Google Authenticator (2FA) successfully enabled!")
        setDialogOpen(false)
        fetchStatus()
      })
      .catch((err) => {
        if (!err?.__toastShown) {
          toast.error(humanizeError(err?.message || "Invalid 2FA code. Please check your authenticator app."))
        }
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  // Open modal to disable 2FA with re-authentication
  function handleOpenDisable() {
    setDisablePassword("")
    setDisableCode("")
    setDisableMethod("password")
    setDisableDialogOpen(true)
  }

  // Submit re-authentication to disable 2FA
  function handleConfirmDisable() {
    if (disableMethod === "password" && !disablePassword.trim()) {
      toast.error("Please enter your account password.")
      return
    }
    if (disableMethod === "code" && disableCode.trim().length !== 6) {
      toast.error("Please enter a valid 6-digit verification code.")
      return
    }

    setSubmittingDisable(true)
    const payload = disableMethod === "password"
      ? { password: disablePassword.trim() }
      : { code: disableCode.trim() }

    disableTotp(payload)
      .then(() => {
        toast.success("Google Authenticator (2FA) successfully disabled.")
        setDisableDialogOpen(false)
        fetchStatus()
      })
      .catch((err) => {
        if (!err?.__toastShown) {
          toast.error(humanizeError(err?.message || "Failed to disable two-factor authentication."))
        }
      })
      .finally(() => {
        setSubmittingDisable(false)
      })
  }

  // Copy secret key to clipboard
  function copySecretToClipboard() {
    if (!setupData?.secret) return
    navigator.clipboard.writeText(setupData.secret)
    setCopiedSecret(true)
    toast.success("2FA secret key copied to clipboard!")
    setTimeout(() => setCopiedSecret(false), 2000)
  }

  return (
    <>
      <SettingItem
        title="Two-Factor Authentication (Google Authenticator 2FA)"
        description="Secure Admin login with a 6-digit verification code from the Google Authenticator app"
      >
        <div className="flex items-center gap-3">
          {loadingStatus ? (
            <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
          ) : status.enabled ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="size-3.5" />
                Active (Protected)
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenDisable}
                disabled={submitting || submittingDisable}
              >
                Disable 2FA
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <ShieldAlert className="size-3.5" />
                Not Enabled
              </span>
              <Button
                type="button"
                size="sm"
                onClick={handleOpenSetup}
                disabled={submitting}
                className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
              >
                {submitting && <LoaderCircle className="size-3.5 animate-spin mr-1.5" />}
                <QrCode className="size-3.5 mr-1.5" />
                Enable Google Authenticator
              </Button>
            </div>
          )}
        </div>
      </SettingItem>

      {/* 2FA Setup Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <ShieldCheck className="size-5 text-purple-600" />
              Set Up Google Authenticator (2FA)
            </DialogTitle>
            <DialogDescription>
              Scan this QR Code using the Google Authenticator app on your phone.
            </DialogDescription>
          </DialogHeader>

          {setupData && (
            <div className="flex flex-col items-center gap-4 py-2">
              {/* QR Code Container */}
              <div className="p-3 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center">
                <img
                  src={setupData.qrCodeUrl}
                  alt="Google Authenticator QR Code"
                  className="size-48 object-contain"
                />
              </div>

              {/* Secret Key Text fallback */}
              <div className="w-full flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground text-center">
                  Or enter this secret key manually into your app:
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-1.5 bg-muted rounded-md text-xs font-mono text-center tracking-wider select-all border">
                    {setupData.secret}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8 shrink-0"
                    onClick={copySecretToClipboard}
                  >
                    {copiedSecret ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                  </Button>
                </div>
              </div>

              {/* 6-Digit OTP Verification Field */}
              <div className="w-full flex flex-col gap-2 pt-2 border-t mt-1">
                <label className="text-xs font-semibold text-foreground text-center">
                  Enter the 6-digit code from Google Authenticator to confirm:
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                  className="text-center tracking-[0.5em] text-lg font-mono"
                  autoFocus
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleEnable2Fa}
              disabled={submitting || verificationCode.length !== 6}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {submitting && <LoaderCircle className="size-4 animate-spin mr-2" />}
              Verify & Enable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2FA Disable Confirmation Dialog */}
      <Dialog open={disableDialogOpen} onOpenChange={setDisableDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-destructive">
              <ShieldAlert className="size-5" />
              Disable Two-Factor Authentication
            </DialogTitle>
            <DialogDescription>
              To protect your account, please verify your identity before disabling Google Authenticator.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* Warning Callout */}
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>
                Disabling 2FA reduces account security. Any device with your username and password will be able to sign in directly.
              </span>
            </div>

            {/* Verification Method Switcher */}
            <div className="grid grid-cols-2 p-1 bg-muted rounded-lg text-xs font-medium">
              <button
                type="button"
                onClick={() => setDisableMethod("password")}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-all",
                  disableMethod === "password"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <KeyRound className="size-3.5" />
                Account Password
              </button>
              <button
                type="button"
                onClick={() => setDisableMethod("code")}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-all",
                  disableMethod === "code"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Smartphone className="size-3.5" />
                Authenticator Code
              </button>
            </div>

            {/* Password Verification Field */}
            {disableMethod === "password" ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Current Account Password
                </label>
                <Input
                  type="password"
                  placeholder="Enter your current password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && disablePassword.trim()) {
                      handleConfirmDisable()
                    }
                  }}
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground">
                  Enter your administrator password to confirm your identity.
                </p>
              </div>
            ) : (
              /* OTP Code Verification Field */
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground text-center">
                  6-Digit Authenticator Code
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && disableCode.trim().length === 6) {
                      handleConfirmDisable()
                    }
                  }}
                  className="text-center tracking-[0.5em] text-lg font-mono"
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground text-center">
                  Enter the live 6-digit code from your Google Authenticator app.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDisableDialogOpen(false)}
              disabled={submittingDisable}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDisable}
              disabled={
                submittingDisable ||
                (disableMethod === "password" ? !disablePassword.trim() : disableCode.length !== 6)
              }
            >
              {submittingDisable && <LoaderCircle className="size-4 animate-spin mr-2" />}
              Disable 2FA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

