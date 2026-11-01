"use client"

import * as React from "react"
import { Download, Smartphone } from "lucide-react"
import { usePwaInstall } from "@/hooks/use-pwa-install"
import { PwaIosDialog } from "@/components/pwa/pwa-ios-dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

interface PwaInstallButtonProps {
  iconOnly?: boolean
  className?: string
}

export function PwaInstallMenuItem() {
  const { canInstall, isIos, isIosGuideOpen, setIsIosGuideOpen, promptInstall } = usePwaInstall()

  if (!canInstall) {
    return null
  }

  return (
    <>
      <DropdownMenuItem onClick={promptInstall}>
        {isIos ? (
          <Smartphone className="size-4 text-sky-500 dark:text-sky-400" />
        ) : (
          <Download className="size-4 text-sky-500 dark:text-sky-400" />
        )}
        <span>{isIos ? "Install on iOS" : "Install App"}</span>
      </DropdownMenuItem>
      <PwaIosDialog open={isIosGuideOpen} onOpenChange={setIsIosGuideOpen} />
    </>
  )
}

export function PwaInstallButton({ iconOnly, className }: PwaInstallButtonProps) {
  const { canInstall, isIos, isIosGuideOpen, setIsIosGuideOpen, promptInstall } = usePwaInstall()

  if (!canInstall) {
    return null
  }

  if (iconOnly) {
    return (
      <>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={promptInstall}
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors cursor-pointer relative",
                  className
                )}
                aria-label="Install NayPict App"
              >
                {isIos ? (
                  <Smartphone className="size-4 text-sky-500 dark:text-sky-400" />
                ) : (
                  <Download className="size-4 text-sky-500 dark:text-sky-400" />
                )}
                <span className="absolute top-1 right-1 size-1.5 rounded-full bg-sky-500 animate-pulse" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {isIos ? "Install on iOS" : "Install App"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <PwaIosDialog open={isIosGuideOpen} onOpenChange={setIsIosGuideOpen} />
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={promptInstall}
        className={cn(
          "flex items-center justify-between w-full py-1.5 px-2.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/15 text-sky-600 dark:text-sky-400 font-medium transition-colors border border-sky-500/20 cursor-pointer text-xs",
          className
        )}
      >
        <span className="flex items-center gap-1.5">
          {isIos ? (
            <Smartphone className="size-3.5" />
          ) : (
            <Download className="size-3.5" />
          )}
          <span>{isIos ? "Install on iOS" : "Install App"}</span>
        </span>
        <span className="flex size-1.5 rounded-full bg-sky-500 animate-pulse" />
      </button>

      <PwaIosDialog open={isIosGuideOpen} onOpenChange={setIsIosGuideOpen} />
    </>
  )
}
