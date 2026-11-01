"use client"

import * as React from "react"
import { Share, PlusSquare, Sparkles, Smartphone, Check } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface PwaIosDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PwaIosDialog({ open, onOpenChange }: PwaIosDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-md border-border/80 bg-background/95 backdrop-blur-2xl shadow-2xl rounded-2xl p-6">
        <DialogHeader className="text-center sm:text-left flex flex-col items-center sm:items-start gap-2">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
            <Smartphone className="size-6" />
          </div>
          <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
            Install NayPict on iOS / iPadOS
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
            Follow these 2 simple steps in Safari to add NayPict as a fullscreen standalone app.
          </DialogDescription>
        </DialogHeader>

        <div className="my-3 space-y-3">
          {/* Step 1 */}
          <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/30 p-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500 font-semibold text-xs border border-sky-500/20">
              1
            </div>
            <div className="text-xs sm:text-sm text-foreground space-y-1">
              <p className="font-medium flex items-center gap-1.5">
                Tap Safari&apos;s Share button
                <Share className="inline size-3.5 text-sky-500" />
              </p>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Found in the bottom bar on iPhone or top right on iPad.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/30 p-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 font-semibold text-xs border border-emerald-500/20">
              2
            </div>
            <div className="text-xs sm:text-sm text-foreground space-y-1">
              <p className="font-medium flex items-center gap-1.5">
                Select &quot;Add to Home Screen&quot;
                <PlusSquare className="inline size-3.5 text-emerald-500" />
              </p>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Scroll down the share sheet and tap <span className="font-semibold text-foreground">Add to Home Screen</span>.
              </p>
            </div>
          </div>

          {/* Benefit Badge */}
          <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2 text-[11px] text-muted-foreground">
            <Sparkles className="size-3.5 text-primary shrink-0" />
            <span>Opens instantaneously without browser URL bar and enables offline media caching.</span>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto font-medium"
          >
            <Check className="size-3.5 mr-1.5" />
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

