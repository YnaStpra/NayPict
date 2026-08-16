"use client"

import { useEffect, useState } from "react"
import { ShieldCheck, ShieldAlert, QrCode, Copy, Check, LoaderCircle } from "lucide-react"
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

export function TotpSettingsCard() {
  const [status, setStatus] = useState<TotpStatusVo>({ enabled: false, configured: false })
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [setupData, setSetupData] = useState<TotpSetupVo | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [verificationCode, setVerificationCode] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [copiedSecret, setCopiedSecret] = useState(false)

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
        toast.error("Gagal menyiapkan Google Authenticator: " + (err?.message || "Error server"))
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
        toast.success("Google Authenticator (2FA) Berhasil Diaktifkan!")
        setDialogOpen(false)
        fetchStatus()
      })
      .catch((err) => {
        toast.error(err?.message || "Kode 2FA tidak valid. Periksa kembali aplikasi Google Authenticator Anda.")
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  // Disable 2FA
  function handleDisable2Fa() {
    if (!confirm("Apakah Anda yakin ingin menonaktifkan keamanan Google Authenticator 2FA?")) return
    setSubmitting(true)

    disableTotp()
      .then(() => {
        toast.success("Google Authenticator 2FA berhasil dinonaktifkan")
        fetchStatus()
      })
      .catch((err) => {
        toast.error("Gagal menonaktifkan 2FA: " + (err?.message || "Error server"))
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  // Copy secret key to clipboard
  function copySecretToClipboard() {
    if (!setupData?.secret) return
    navigator.clipboard.writeText(setupData.secret)
    setCopiedSecret(true)
    toast.success("Kunci rahasia 2FA berhasil disalin!")
    setTimeout(() => setCopiedSecret(false), 2000)
  }

  return (
    <>
      <SettingItem
        title="Otentikasi Dua Langkah (Google Authenticator 2FA)"
        description="Amankan login Admin dengan verifikasi kode 6-digit dari aplikasi Google Authenticator"
      >
        <div className="flex items-center gap-3">
          {loadingStatus ? (
            <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
          ) : status.enabled ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="size-3.5" />
                Aktif (Terlindungi)
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDisable2Fa}
                disabled={submitting}
              >
                Nonaktifkan 2FA
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <ShieldAlert className="size-3.5" />
                Belum Aktif
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
                Aktifkan Google Authenticator
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
              Menyiapkan Google Authenticator (2FA)
            </DialogTitle>
            <DialogDescription>
              Pindai QR Code menggunakan aplikasi Google Authenticator di HP Anda.
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
                  Atau masukkan kunci rahasia ini secara manual di aplikasi:
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
                  Masukkan 6 digit kode dari Google Authenticator untuk mengonfirmasi:
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
              Batal
            </Button>
            <Button
              type="button"
              onClick={handleEnable2Fa}
              disabled={submitting || verificationCode.length !== 6}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {submitting && <LoaderCircle className="size-4 animate-spin mr-2" />}
              Verifikasi & Aktifkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
