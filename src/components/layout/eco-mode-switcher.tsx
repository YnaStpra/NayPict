"use client"

import { Leaf } from "lucide-react"
import { useAdaptivePerformance, setEcoModeOverride } from "@/hooks/use-adaptive-performance"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface EcoModeSwitcherProps {
  iconOnly?: boolean
}

// Render the Smart Battery & Data Saver Eco Mode toggle button with responsive indicator.
export function EcoModeSwitcher({ iconOnly = false }: EcoModeSwitcherProps) {
  const { isEcoMode, ecoModeOverride } = useAdaptivePerformance()

  const cycleMode = () => {
    // Cycle: auto -> force-on -> force-off -> auto
    const nextMode =
      ecoModeOverride === "auto"
        ? (isEcoMode ? "force-off" : "force-on")
        : ecoModeOverride === "force-on"
        ? "force-off"
        : "auto"
    setEcoModeOverride(nextMode)
  }

  const modeLabel =
    ecoModeOverride === "auto"
      ? (isEcoMode ? "Auto (Active)" : "Auto")
      : ecoModeOverride === "force-on"
      ? "On (Saver)"
      : "Off"

  const tooltipText = `Eco Saver: ${modeLabel} - Low GPU & Battery Mode`

  if (iconOnly) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={cycleMode}
              className={`flex size-8 items-center justify-center rounded-lg transition-colors duration-150 cursor-pointer select-none ${
                isEcoMode
                  ? "text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
              aria-label={tooltipText}
            >
              <Leaf className={`size-4 ${isEcoMode ? "text-emerald-500" : "text-muted-foreground"}`} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {tooltipText}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <button
      type="button"
      onClick={cycleMode}
      className="flex items-center justify-between gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent/80 transition-colors duration-150 cursor-pointer select-none"
      title={tooltipText}
    >
      <div className="flex items-center gap-2">
        <Leaf className={`size-4 shrink-0 ${isEcoMode ? "text-emerald-500" : "text-muted-foreground"}`} />
        <span className="truncate">Eco Saver</span>
      </div>
      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide border transition-colors ${
          isEcoMode
            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
            : "bg-muted text-muted-foreground border-border/50"
        }`}
      >
        {modeLabel}
      </span>
    </button>
  )
}
