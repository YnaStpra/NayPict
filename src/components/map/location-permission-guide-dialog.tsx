"use client"

import { Compass, RefreshCw, ShieldAlert, CheckCircle2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { type UnblockGuide } from "@/hooks/use-user-location"
import { useModalBackHandler } from "@/hooks/use-modal-back-handler"

interface LocationPermissionGuideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRequestLocation: () => void | Promise<void>
  guide: UnblockGuide
}

/**
 * Dialog displaying step-by-step device and browser troubleshooting
 * instructions when location access is denied or blocked.
 */
export function LocationPermissionGuideDialog({
  open,
  onOpenChange,
  onRequestLocation,
  guide,
}: LocationPermissionGuideDialogProps) {
  // Support Android browser back button to close modal
  useModalBackHandler(open, () => onOpenChange(false))

  const handleRetry = async () => {
    onOpenChange(false)
    await onRequestLocation()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-6 rounded-3xl backdrop-blur-2xl bg-background/95 dark:bg-neutral-900/95 border border-border/80 shadow-2xl">
        <DialogHeader className="space-y-2 text-left">
          <div className="size-11 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center mb-1">
            <ShieldAlert className="size-6" />
          </div>
          <DialogTitle className="text-base sm:text-lg font-bold">
            {guide.title || "Allow Location Access"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            Your browser or device currently restricts location access for this site. Follow these steps for {guide.browser} to unblock it:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 my-2">
          {guide.steps.map((step, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-3 rounded-2xl bg-muted/40 border border-border/50 text-xs"
            >
              <div className="size-5 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0 font-bold text-[11px] mt-0.5">
                {idx + 1}
              </div>
              <p className="text-foreground leading-snug">{step}</p>
            </div>
          ))}
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            onClick={handleRetry}
            className="flex-1 rounded-xl text-xs font-semibold gap-1.5 cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground h-9"
          >
            <RefreshCw className="size-3.5" />
            <span>I Have Allowed It, Try Again</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl text-xs h-9 cursor-pointer"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
