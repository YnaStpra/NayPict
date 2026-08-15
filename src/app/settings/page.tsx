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
import { settingSet } from "@/request/setting"
import { type Setting } from "@/server/entity/setting"
import { SettingPhotoDedupEnum, SettingSyncDeleteEnum } from "@/server/enums/setting-enum"
import { useTranslations } from "next-intl"

export default function Page() {
  const t = useTranslations("settings")
  const { sidebarOpen, setSidebarOpen } = useApp()
  const { initialSetting } = useSettingContext()
  // setting Save the system settings being edited on the current page。
  const [setting, setSetting] = useState<Setting>(initialSetting)

  // Modify sync delete switch value。
  function changeSyncDelete(syncDelete: string) {
    setSetting((prev) => ({
      ...prev,
      syncDelete: Number(syncDelete),
    }))
  }

  // Modify photo deduplication switch value。
  function changePhotoDedup(checked: boolean) {
    setSetting((prev) => ({
      ...prev,
      photoDedup: checked ? SettingPhotoDedupEnum.ENABLE : SettingPhotoDedupEnum.DISABLE,
    }))
  }

  // Modify the number of days for automatic cleaning of the Recycle Bin。
  function changeClearLast(event: ChangeEvent<HTMLInputElement>) {
    setSetting((prev) => ({
      ...prev,
      clearLast: Number(event.target.value || 0),
    }))
  }

  // Save current system settings。
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
          className="flex h-13 shrink-0 items-center justify-between gap-2 bg-background">
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
          </div>

          {/* Admin-Only Public Mascot Roster (VSCode Pokemon Pets) */}
          <div className="mt-8">
            <h2 className="text-xl font-semibold pb-3 md:pb-4 flex items-center gap-2">
              <span>Public Gallery Mascots (VSCode Pokemon Pets)</span>
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              Only authenticated Admins can configure which Pokemon & Cat mascots are enabled on the public gallery. Regular public visitors cannot add or alter mascots.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { key: 'kuro', name: 'Kuro Cat', type: 'Alley Cat 🐾', icon: '🐱', color: 'border-slate-700 bg-slate-900/40 text-slate-200' },
                { key: 'pikachu', name: 'Pikachu', type: 'Electric ⚡', icon: '⚡', color: 'border-amber-500/40 bg-amber-500/10 text-amber-300' },
                { key: 'charmander', name: 'Charmander', type: 'Fire 🔥', icon: '🔥', color: 'border-orange-500/40 bg-orange-500/10 text-orange-300' },
                { key: 'bulbasaur', name: 'Bulbasaur', type: 'Grass 🍃', icon: '🍃', color: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' },
                { key: 'squirtle', name: 'Squirtle', type: 'Water 💧', icon: '💧', color: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' },
                { key: 'eevee', name: 'Eevee', type: 'Normal 🦊', icon: '🦊', color: 'border-yellow-600/40 bg-yellow-600/10 text-yellow-200' },
                { key: 'gengar', name: 'Gengar', type: 'Ghost 👻', icon: '👻', color: 'border-purple-500/40 bg-purple-500/10 text-purple-300' },
              ].map((mascot) => {
                const activeMascots = setting.activeMascots || ['kuro', 'pikachu']
                const isChecked = activeMascots.includes(mascot.key)

                const toggleMascot = () => {
                  const updated = isChecked
                    ? activeMascots.filter((m) => m !== mascot.key)
                    : [...activeMascots, mascot.key]

                  setSetting((prev) => ({
                    ...prev,
                    activeMascots: updated.length > 0 ? updated : ['kuro'],
                  }))
                }

                return (
                  <div
                    key={mascot.key}
                    onClick={toggleMascot}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      isChecked ? `${mascot.color} shadow-sm ring-1 ring-primary/30` : 'border-border/50 bg-card/40 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{mascot.icon}</span>
                      <div>
                        <div className="font-semibold text-sm">{mascot.name}</div>
                        <div className="text-[11px] opacity-80">{mascot.type}</div>
                      </div>
                    </div>
                    <Switch checked={isChecked} onCheckedChange={toggleMascot} />
                  </div>
                )
              })}
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <Button type="button" size="lg" className="px-8 cursor-pointer font-semibold shadow-md" onClick={saveSetting}>
              {t("save")}
            </Button>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
