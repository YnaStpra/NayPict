"use client"

import * as React from "react"
import { useEffect } from "react"
import {
  Keyboard,
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Info,
  MessageSquare,
  Heart,
  Play,
  Volume2,
  SunMoon,
  PanelLeft,
  X,
  Compass,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useShortcutsStore } from "@/store/shortcuts-store"
import { useApp } from "@/app/provider"

interface ShortcutItemProps {
  keys: string[]
  label: string
  description: string
  icon: React.ReactNode
}

function ShortcutItem({ keys, label, description, icon }: ShortcutItemProps) {
  return (
    <div className="flex items-center justify-between py-2 px-2.5 rounded-xl transition-colors hover:bg-muted/40">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground border border-border/50">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-medium text-foreground truncate">{label}</p>
          <p className="text-[11px] text-muted-foreground truncate">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-2">
        {keys.map((k, i) => (
          <kbd
            key={i}
            className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-md border border-border/80 bg-muted/80 px-1.5 font-mono text-[11px] font-semibold text-foreground shadow-xs select-none"
          >
            {k}
          </kbd>
        ))}
      </div>
    </div>
  )
}

export function KeyboardShortcutsDialog() {
  const { open, setOpen, toggleShortcuts } = useShortcutsStore()
  const { toggleTheme, setSidebarOpen } = useApp()

  // Global keyboard shortcuts listener for gallery navigation
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return
      }

      // '?' opens or closes the cheatsheet
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault()
        toggleShortcuts()
        return
      }

      // If shortcuts dialog is currently open, let Dialog handle Escape
      if (useShortcutsStore.getState().open) {
        return
      }

      // Only handle T and B when not inside photo viewer lightbox
      const isViewerOpen = Boolean(document.querySelector("[data-yarl-viewer-open='true']"))
      if (!isViewerOpen) {
        if (e.key === "t" || e.key === "T") {
          e.preventDefault()
          toggleTheme()
        } else if (e.key === "b" || e.key === "B") {
          e.preventDefault()
          setSidebarOpen((prev) => !prev)
        }
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown)
    return () => window.removeEventListener("keydown", handleGlobalKeyDown)
  }, [toggleShortcuts, toggleTheme, setSidebarOpen])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg border-border/80 bg-background/95 backdrop-blur-2xl shadow-2xl sm:rounded-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500 border border-violet-500/20">
              <Keyboard className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold sm:text-lg">
                Keyboard Shortcuts
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Power-user hotkeys for swift gallery browsing and media viewing.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto px-4 py-3 space-y-5 flex-1">
          {/* Section: Media Viewer */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Compass className="size-3 text-sky-500" />
              <span>Media Viewer Lightbox</span>
            </div>
            <div className="divide-y divide-border/30">
              <ShortcutItem
                keys={["←", "→"]}
                label="Navigate Slides"
                description="Move to previous or next photo / video"
                icon={<ArrowRight className="size-3.5 text-sky-500" />}
              />
              <ShortcutItem
                keys={["Space"]}
                label="Play / Pause / Slideshow"
                description="Toggle video playback or start photo auto-slideshow"
                icon={<Play className="size-3.5 text-amber-500" />}
              />
              <ShortcutItem
                keys={["F"]}
                label="Cinematic Mode"
                description="Hide toolbars and ambient distractions for immersive viewing"
                icon={<Maximize2 className="size-3.5 text-cyan-500" />}
              />
              <ShortcutItem
                keys={["I"]}
                label="Toggle EXIF & Map"
                description="Show or hide camera settings, lens details, and GPS location"
                icon={<Info className="size-3.5 text-emerald-500" />}
              />
              <ShortcutItem
                keys={["C"]}
                label="Toggle Comments"
                description="Open visitor feedback and discussion panel"
                icon={<MessageSquare className="size-3.5 text-indigo-500" />}
              />
              <ShortcutItem
                keys={["L", "H"]}
                label="Heart / Love Reaction"
                description="Trigger animated heart burst reaction on active photo"
                icon={<Heart className="size-3.5 text-rose-500" />}
              />
              <ShortcutItem
                keys={["M"]}
                label="Mute Video"
                description="Toggle video sound mute / unmute"
                icon={<Volume2 className="size-3.5 text-orange-500" />}
              />
              <ShortcutItem
                keys={["Esc"]}
                label="Close / Exit"
                description="Close sidebar panels or exit the viewer lightbox"
                icon={<X className="size-3.5 text-red-500" />}
              />
            </div>
          </div>

          {/* Section: General Gallery */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <PanelLeft className="size-3 text-violet-500" />
              <span>Gallery & App Navigation</span>
            </div>
            <div className="divide-y divide-border/30">
              <ShortcutItem
                keys={["?"]}
                label="Shortcuts Cheatsheet"
                description="Display or dismiss this keyboard shortcuts modal"
                icon={<Keyboard className="size-3.5 text-violet-500" />}
              />
              <ShortcutItem
                keys={["T"]}
                label="Toggle Dark / Light Theme"
                description="Instantly switch application appearance mode"
                icon={<SunMoon className="size-3.5 text-amber-500" />}
              />
              <ShortcutItem
                keys={["B"]}
                label="Toggle Navigation Sidebar"
                description="Expand or collapse the main app sidebar"
                icon={<PanelLeft className="size-3.5 text-sky-500" />}
              />
              <ShortcutItem
                keys={["Esc"]}
                label="Deselect Media"
                description="Cancel multi-selection drawer in photo gallery"
                icon={<X className="size-3.5 text-muted-foreground" />}
              />
            </div>
          </div>
        </div>

        <div className="p-3 px-5 border-t border-border/60 bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
          <span>Press <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border">?</kbd> anytime to reopen</span>
          <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted border border-border">Esc to close</kbd>
        </div>
      </DialogContent>
    </Dialog>
  )
}
