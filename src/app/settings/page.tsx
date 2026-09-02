"use client"

import { useState, type ChangeEvent } from "react"
import { toast } from "sonner"
import { AppSidebar } from "@/components/layout/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"

import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { useApp } from "@/app/provider"
import { useSettingContext } from "@/app/settings/provider"
import { SettingItem } from "@/components/setting/setting-item"
import { TotpSettingsCard } from "@/components/setting/totp-settings-card"
import { ActiveSessionsCard } from "@/components/setting/active-sessions-card"
import { DatabaseBackupCard } from "@/components/setting/database-backup-card"
import { settingSet } from "@/request/setting"
import { type Setting } from "@/server/entity/setting"
import { SettingOnThisDayEnum, SettingPhotoDedupEnum, SettingSyncDeleteEnum } from "@/server/enums/setting-enum"
import { useTranslations } from "next-intl"

export default function Page() {
  const t = useTranslations("settings")
  const { sidebarOpen, setSidebarOpen } = useApp()
  const { initialSetting } = useSettingContext()
  // setting Save the system settings being edited on the current page.
  const [setting, setSetting] = useState<Setting>(initialSetting)

  // Modify sync delete switch value.
  function changeSyncDelete(syncDelete: string) {
    setSetting((prev) => ({
      ...prev,
      syncDelete: Number(syncDelete),
    }))
  }

  // Modify photo deduplication switch value.
  function changePhotoDedup(checked: boolean) {
    setSetting((prev) => ({
      ...prev,
      photoDedup: checked ? SettingPhotoDedupEnum.ENABLE : SettingPhotoDedupEnum.DISABLE,
    }))
  }

  // Modify On This Day memories showcase switch value.
  function changeOnThisDay(checked: boolean) {
    setSetting((prev) => ({
      ...prev,
      onThisDay: checked ? SettingOnThisDayEnum.ENABLE : SettingOnThisDayEnum.DISABLE,
    }))
  }

  // Modify the number of days for automatic cleaning of the Recycle Bin.
  function changeClearLast(event: ChangeEvent<HTMLInputElement>) {
    setSetting((prev) => ({
      ...prev,
      clearLast: Number(event.target.value || 0),
    }))
  }

  // Save current system settings.
  function saveSetting() {
    settingSet(setting).then(() => {
      toast.success(t("saved"))
    })
  }

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <AppSidebar />
      <SidebarInset>
        <header
          className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-2 bg-background/95 backdrop-blur-md border-b transition-[width,height] ease-linear">
          <div className="flex min-w-0 items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>{t("title")}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-5xl flex-col px-5 py-3 md:py-4">
          <h1 className="text-xl font-semibold pb-3 md:pb-4">{t("basicFeatures")}</h1>
          <Separator className="my-4" />
          <div className="flex flex-col">
            <SettingItem title={t("scheduledCleanup")} description={t("scheduledCleanupDescription")}>
              <InputGroup className="w-30">
                <InputGroupInput
                  id="clear-last"
                  type="number"
                  min="0"
                  max="30"
                  className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  value={setting.clearLast || ""}
                  onChange={changeClearLast}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{t("days")}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </SettingItem>
            <SettingItem title={t("syncDelete")} description={t("syncDeleteDescription")}>
              <RadioGroup
                className="flex flex-row gap-6"
                value={String(setting.syncDelete)}
                onValueChange={changeSyncDelete}
              >
                {[
                  { label: t("enabled"), value: SettingSyncDeleteEnum.ENABLE },
                  { label: t("disabled"), value: SettingSyncDeleteEnum.DISABLE },
                ].map((option) => (
                  <div key={option.value} className="flex items-center gap-2">
                    <RadioGroupItem id={`sync-delete-${option.value}`} value={String(option.value)} />
                    <Label htmlFor={`sync-delete-${option.value}`}>{option.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </SettingItem>
            <SettingItem title={t("photoDeduplication")} description={t("photoDeduplicationDescription")}>
              <Switch
                checked={setting.photoDedup === SettingPhotoDedupEnum.ENABLE}
                onCheckedChange={changePhotoDedup}
              />
            </SettingItem>
            <SettingItem title={t("onThisDay")} description={t("onThisDayDescription")}>
              <Switch
                checked={setting.onThisDay !== SettingOnThisDayEnum.DISABLE}
                onCheckedChange={changeOnThisDay}
              />
            </SettingItem>
            <TotpSettingsCard />
            <ActiveSessionsCard />
            <DatabaseBackupCard />
          </div>
          <div className="mt-8 flex justify-end">
            <Button type="button" onClick={saveSetting}>
              {t("save")}
            </Button>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
