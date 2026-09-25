"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useApp } from "@/app/provider";
import { UserTypeEnum } from "@/server/enums/user-enum";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";

interface RightClickGuardProps {
  // Explicit toggle flag (defaults to true)
  enabled?: boolean;
}

/**
 * Comprehensive Media Anti-Theft Protection Guard:
 * 1. Anti-Snipping Focus Blur: Blurs and obfuscates media when the browser loses focus (e.g. Snipping tool, Cmd+Shift+4, screen recording apps).
 * 2. Transparent Shield & Anti-Touch: Disables iOS Safari long-press 'Save to Photos' sheet (-webkit-touch-callout: none) and image drag-and-drop.
 * 3. Keyboard & Print Guard: Disables PrintScreen (clears clipboard), Ctrl+P / Cmd+P, Ctrl+S / Cmd+S, and guest DevTools shortcuts.
 * 4. Zero restrictions for authenticated Admin users.
 */
export function RightClickGuard({ enabled = true }: RightClickGuardProps) {
  const { userInfo } = useApp();
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN;
  const [isProtected, setIsProtected] = useState(false);
  const unprotectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trigger momentary obfuscation (e.g. on PrintScreen key)
  const triggerMomentaryProtection = useCallback(() => {
    if (isAdmin) return;
    setIsProtected(true);
    document.documentElement.setAttribute("data-screen-protected", "true");

    if (unprotectTimerRef.current) {
      clearTimeout(unprotectTimerRef.current);
    }
    unprotectTimerRef.current = setTimeout(() => {
      setIsProtected(false);
      document.documentElement.removeAttribute("data-screen-protected");
    }, 1500);
  }, [isAdmin]);

  useEffect(() => {
    // Administrative users have 100% unrestricted access
    if (!enabled || isAdmin || typeof window === "undefined") {
      document.documentElement.removeAttribute("data-screen-protected");
      return;
    }

    // 1. Intercept context menu on media elements silently
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "IMG" ||
          target.tagName === "VIDEO" ||
          target.tagName === "CANVAS" ||
          target.closest(".yet-another-react-lightbox") ||
          target.closest("[data-photo-item]") ||
          target.closest("[data-slot='photo-card']"))
      ) {
        e.preventDefault();
      }
    };

    // 2. Prevent dragging media files to desktop or folders
    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "IMG" || target.tagName === "VIDEO")) {
        e.preventDefault();
      }
    };

    // 3. Anti-Snipping Focus Blur: Detect when window loses focus (Snipping Tool, Mac Cmd+Shift+4, app switcher)
    const handleWindowBlur = () => {
      // Delay slightly (50ms) to prevent false positives when interacting with internal select/inputs
      setTimeout(() => {
        if (!document.hasFocus() || document.hidden) {
          setIsProtected(true);
          document.documentElement.setAttribute("data-screen-protected", "true");
        }
      }, 60);
    };

    const handleWindowFocus = () => {
      if (unprotectTimerRef.current) {
        clearTimeout(unprotectTimerRef.current);
      }
      setIsProtected(false);
      document.documentElement.removeAttribute("data-screen-protected");
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsProtected(true);
        document.documentElement.setAttribute("data-screen-protected", "true");
      } else if (document.hasFocus()) {
        setIsProtected(false);
        document.documentElement.removeAttribute("data-screen-protected");
      }
    };

    // 4. Keyboard Shortcuts Interception
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key ? e.key.toLowerCase() : "";
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;

      // Intercept PrintScreen key: clear clipboard & obfuscate
      if (e.key === "PrintScreen" || e.keyCode === 44) {
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText("").catch(() => {});
        }
        triggerMomentaryProtection();
        toast.info("Screen capture is protected.", { id: "guard-printscreen" });
        return;
      }

      // Intercept Print shortcut (Ctrl+P / Cmd+P)
      if (isCmdOrCtrl && key === "p") {
        e.preventDefault();
        e.stopPropagation();
        toast.info("Printing media is disabled on this gallery.", { id: "guard-print" });
        return;
      }

      // Intercept Save Page shortcut (Ctrl+S / Cmd+S)
      if (isCmdOrCtrl && !e.shiftKey && key === "s") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Intercept View Source shortcut (Ctrl+U / Cmd+U)
      if (isCmdOrCtrl && key === "u") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Intercept Guest DevTools shortcuts (F12, Ctrl+Shift+I, Cmd+Opt+I, Ctrl+Shift+J, Ctrl+Shift+C)
      if (
        e.key === "F12" ||
        (isCmdOrCtrl && e.shiftKey && (key === "i" || key === "j" || key === "c"))
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    };

    document.addEventListener("contextmenu", handleContextMenu, { capture: true });
    document.addEventListener("dragstart", handleDragStart, { capture: true });
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu, { capture: true });
      document.removeEventListener("dragstart", handleDragStart, { capture: true });
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.documentElement.removeAttribute("data-screen-protected");
    };
  }, [enabled, isAdmin, triggerMomentaryProtection]);

  // Never render protective styles for admin
  if (!enabled || isAdmin) {
    return null;
  }

  return (
    <>
      {/* Global CSS Guard: Transparent Shield, Anti-Touch Callout, Anti-Snipping Blur, and Print Lockdown */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            /* 1. Transparent Shield & Touch Protection */
            img, video, canvas {
              -webkit-user-drag: none !important;
              -khtml-user-drag: none !important;
              -moz-user-drag: none !important;
              -o-user-drag: none !important;
              user-drag: none !important;
              -webkit-touch-callout: none !important; /* Disables iOS Safari 'Save Image' long-press sheet */
              user-select: none !important;
              -webkit-user-select: none !important;
            }

            /* 2. Anti-Snipping Focus Blur (Applies when window loses focus during screenshot tools) */
            html[data-screen-protected="true"] img,
            html[data-screen-protected="true"] video,
            html[data-screen-protected="true"] canvas,
            html[data-screen-protected="true"] [data-photo-item],
            html[data-screen-protected="true"] .yet-another-react-lightbox,
            html[data-screen-protected="true"] [data-slot="photo-card"] {
              filter: blur(48px) saturate(0.1) brightness(0.6) !important;
              opacity: 0.15 !important;
              pointer-events: none !important;
              transition: filter 0.15s ease-out, opacity 0.15s ease-out !important;
            }

            /* 3. Strict Print Protection */
            @media print {
              html, body {
                visibility: hidden !important;
                height: 100% !important;
                overflow: hidden !important;
              }
              body::before {
                content: "Protected Media — Printing is disabled on this gallery.";
                visibility: visible !important;
                display: block !important;
                text-align: center !important;
                padding-top: 100px !important;
                font-size: 18px !important;
                font-family: sans-serif !important;
                font-weight: 600 !important;
                color: #555 !important;
              }
              img, video, canvas, [data-photo-item], .yet-another-react-lightbox, [data-slot="photo-card"] {
                display: none !important;
                visibility: hidden !important;
              }
            }
          `,
        }}
      />

      {/* Floating Protected Notice shown only when active anti-snipping blur is engaged */}
      {isProtected && (
        <div
          className="fixed inset-0 z-[999999] pointer-events-none flex items-center justify-center backdrop-blur-3xl bg-background/50 transition-all duration-200"
          aria-hidden="true"
        >
          <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-background/90 border border-primary/20 shadow-2xl backdrop-blur-xl text-xs font-semibold text-foreground tracking-wide animate-in fade-in zoom-in-95 duration-150">
            <ShieldAlert className="size-4 text-primary shrink-0" />
            <span>Protected Media Preview — NayPict</span>
          </div>
        </div>
      )}
    </>
  );
}

// Alias export for clarity
export { RightClickGuard as MediaProtectionGuard };
