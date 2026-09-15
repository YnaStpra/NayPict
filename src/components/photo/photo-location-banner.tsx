"use client"

import { useEffect, useState } from "react"
import { Loader2, Navigation, ShieldCheck, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUserLocation } from "@/hooks/use-user-location"
import { toast } from "sonner"
import { LocationPermissionGuideDialog } from "@/components/map/location-permission-guide-dialog"

/**
 * Shared session storage keys for location prompt dismissal across main gallery and map.
 */
const LOCATION_PROMPT_DISMISSED_KEY = "naypict_loc_prompt_dismissed"
const MAP_LOCATION_PROMPT_DISMISSED_KEY = "naypict_map_loc_prompt_dismissed"

interface PhotoLocationBannerProps {
  onLocationGranted?: () => void
}

/**
 * Prompts first-time visitors on the main photo gallery to share location for interactive features
 * while reassuring them with explicit privacy guarantees.
 */
export function PhotoLocationBanner({ onLocationGranted }: PhotoLocationBannerProps) {
  const { coords, loading, requestLocation, permissionState, unblockGuide } = useUserLocation()
  const [dismissed, setDismissed] = useState<boolean>(true)
  const [guideOpen, setGuideOpen] = useState<boolean>(false)

  // Initialize visibility on client mount after inspecting session dismissal and coords state
  useEffect(() => {
    if (typeof window === "undefined") return
    if (coords) {
      setDismissed(true)
      return
    }

    const isDismissed =
      sessionStorage.getItem(LOCATION_PROMPT_DISMISSED_KEY) === "1" ||
      sessionStorage.getItem(MAP_LOCATION_PROMPT_DISMISSED_KEY) === "1"

    if (!isDismissed && permissionState !== "denied") {
      setDismissed(false)
    }
  }, [coords, permissionState])

  // Dismiss prompt for the remainder of current browsing session
  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(LOCATION_PROMPT_DISMISSED_KEY, "1")
      sessionStorage.setItem(MAP_LOCATION_PROMPT_DISMISSED_KEY, "1")
    }
    setDismissed(true)
  }

  // Request location from browser Geolocation API
  const handleEnableLocation = async () => {
    const loc = await requestLocation(true)
    if (loc) {
      setDismissed(true)
      toast.success("Location enabled! Showing photos closest to you.")
      onLocationGranted?.()
    } else {
      // If permission is denied or blocked, display step-by-step device unblock guide
      setGuideOpen(true)
    }
  }

  // Render unblock guide dialog even if banner is dismissed or hidden
  if (dismissed || coords) {
    return (
      <LocationPermissionGuideDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        onRequestLocation={handleEnableLocation}
        guide={unblockGuide}
      />
    )
  }

  return (
    <>
      <div className="w-full px-3 sm:px-4 md:px-5 pt-1 pb-3 box-border min-w-0 animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="relative overflow-hidden rounded-3xl border border-sky-500/30 bg-gradient-to-r from-sky-500/10 via-background/95 to-indigo-500/10 dark:from-sky-950/40 dark:via-neutral-900/90 dark:to-indigo-950/40 backdrop-blur-2xl p-4 sm:p-5 shadow-lg shadow-sky-500/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0 flex-1">
              <div className="size-10 rounded-2xl bg-sky-500/15 text-sky-500 flex items-center justify-center shrink-0 mt-0.5 shadow-sm border border-sky-500/20">
                <Navigation className="size-5 fill-sky-500" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                    Interactive Feature
                  </span>
                  <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                    <ShieldCheck className="size-3.5 text-emerald-500" /> Strictly Private
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-bold text-foreground tracking-tight">
                  Enabling location unlocks an exciting experience while exploring this website
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1 max-w-2xl">
                  Your location is used solely to enhance interactive features, such as discovering photos taken near you and calculating distances. Your location data is strictly confidential, kept on your device, and will never be shared with or disclosed to anyone.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center pl-13 sm:pl-0">
              <Button
                type="button"
                onClick={handleEnableLocation}
                disabled={loading}
                className="h-9 px-4 text-xs font-semibold rounded-2xl bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    <span>Detecting Location...</span>
                  </>
                ) : (
                  <>
                    <Navigation className="size-3.5 fill-white mr-1.5" />
                    <span>Enable Location</span>
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleDismiss}
                className="h-9 px-3 text-xs text-muted-foreground hover:text-foreground rounded-2xl cursor-pointer"
              >
                Maybe Later
              </Button>
              <button
                type="button"
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-foreground p-1.5 rounded-xl hover:bg-foreground/5 transition-colors cursor-pointer"
                title="Dismiss notification"
                aria-label="Dismiss notification"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <LocationPermissionGuideDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        onRequestLocation={handleEnableLocation}
        guide={unblockGuide}
      />
    </>
  )
}
