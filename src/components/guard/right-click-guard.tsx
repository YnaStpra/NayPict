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
 * Advanced Multi-OS Media Anti-Theft & Screen Capture Protection Guard:
 *
 * 1. macOS Shortcut Intercept (Cmd+Shift+3, Cmd+Shift+4, Cmd+Shift+5):
 *    Detects the modifier combination (Cmd + Shift) the exact microsecond it is pressed,
 *    blurring and shielding media BEFORE the capture key (3/4/5) is struck.
 *
 * 2. Windows Shortcut Intercept (Win+Shift+S, PrintScreen, Alt+PrtScn):
 *    Clears clipboard on PrtScn and instantly triggers protective obfuscation.
 *
 * 3. Multi-Space & Window Focus Loss (macOS Spaces, Window Blur, Tab Switch):
 *    Instantly applies 0ms heavy blur when window loses focus, space is switched, or tab is hidden.
 *
 * 4. Viewport Mouse-Leave Protection:
 *    When cursor leaves the browser window (e.g. to launch Snipping Tool, OBS, or QuickTime from menu bar/dock),
 *    the gallery instantly enters protective blur.
 *
 * 5. Mobile (iOS / Android) Hardening:
 *    -webkit-touch-callout: none completely eliminates the iOS Safari long-press 'Save to Photos' sheet.
 *    Drag-and-drop is locked down on mobile and desktop.
 *
 * 6. Print & PDF Export Lockdown:
 *    @media print removes 100% of media elements and prints a copyright notice.
 */
export function RightClickGuard({ enabled = true }: RightClickGuardProps) {
  const { userInfo } = useApp();
  const isAdmin = userInfo?.type === UserTypeEnum.ADMIN;
  const [isProtected, setIsProtected] = useState(false);
  const unprotectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isModifierHeldRef = useRef(false);

  // Activates immediate protective obfuscation
  const protectNow = useCallback((durationMs = 0) => {
    setIsProtected(true);
    document.documentElement.setAttribute("data-screen-protected", "true");

    if (unprotectTimerRef.current) {
      clearTimeout(unprotectTimerRef.current);
      unprotectTimerRef.current = null;
    }

    if (durationMs > 0) {
      unprotectTimerRef.current = setTimeout(() => {
        // Only unprotect if window is actually focused and visible
        if (document.hasFocus() && !document.hidden && !isModifierHeldRef.current) {
          setIsProtected(false);
          document.documentElement.removeAttribute("data-screen-protected");
        }
      }, durationMs);
    }
  }, []);

  // Deactivates protection cleanly
  const unprotectNow = useCallback(() => {
    if (isModifierHeldRef.current) return;
    if (unprotectTimerRef.current) {
      clearTimeout(unprotectTimerRef.current);
      unprotectTimerRef.current = null;
    }
    setIsProtected(false);
    document.documentElement.removeAttribute("data-screen-protected");
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      document.documentElement.removeAttribute("data-screen-protected");
      return;
    }

    // 1. Silent context-menu intercept on all media
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

    // 2. Prevent drag-and-drop of images / videos to desktop or other apps
    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "IMG" ||
          target.tagName === "VIDEO" ||
          target.tagName === "CANVAS" ||
          target.closest("[data-photo-item]"))
      ) {
        e.preventDefault();
      }
    };

    // 3. Instant Focus Loss & Visibility Protection (0ms delay)
    const handleWindowBlur = () => {
      protectNow(0);
    };

    const handleWindowFocus = () => {
      // Small debounce to ensure window is truly settled
      setTimeout(() => {
        if (document.hasFocus() && !document.hidden && !isModifierHeldRef.current) {
          unprotectNow();
        }
      }, 80);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        protectNow(0);
      } else if (document.hasFocus()) {
        unprotectNow();
      }
    };

    // 4. Viewport Boundary Protection: When cursor moves outside browser window
    const handleMouseLeave = (e: MouseEvent) => {
      // If mouse left the browser viewport (to top menu bar, dock, taskbar, or another screen)
      if (!e.relatedTarget) {
        protectNow(0);
      }
    };

    const handleMouseEnter = () => {
      if (document.hasFocus() && !document.hidden && !isModifierHeldRef.current) {
        unprotectNow();
      }
    };

    // 5. High-Priority Keydown Interception (Capture Phase)
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key ? e.key.toLowerCase() : "";
      const code = e.code ? e.code.toLowerCase() : "";
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      // Allow Redo (Cmd+Shift+Z) inside text input fields
      if (isInput && isCmdOrCtrl && e.shiftKey && key === "z") {
        return;
      }

      // Allow Admin to open DevTools if needed (F12 or Cmd+Opt+I)
      if (isAdmin && (e.key === "F12" || (isCmdOrCtrl && (key === "i" || key === "j")))) {
        return;
      }

      // [CRITICAL] Detect macOS Cmd+Shift or Windows Ctrl+Shift / Alt+Shift combinations IMMEDIATELY
      // The moment Cmd + Shift are held down together, blur screen BEFORE key 3, 4, or 5 is struck!
      if ((e.metaKey && e.shiftKey) || (e.ctrlKey && e.shiftKey) || (e.altKey && e.shiftKey)) {
        isModifierHeldRef.current = true;
        protectNow(2200);

        // If it's specifically 3, 4, or 5 (macOS screenshot keys)
        if (key === "3" || key === "4" || key === "5" || code === "digit3" || code === "digit4" || code === "digit5") {
          e.preventDefault();
          e.stopPropagation();
          protectNow(2500);
          toast.info("Screen capture is protected.", { id: "guard-screenshot" });
          return;
        }
      }

      // Intercept Windows PrintScreen key: clear clipboard and obfuscate
      if (e.key === "PrintScreen" || code === "printscreen" || e.keyCode === 44) {
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText("").catch(() => {});
        }
        protectNow(2500);
        toast.info("Screen capture is protected.", { id: "guard-printscreen" });
        return;
      }

      // Intercept Print shortcut (Ctrl+P / Cmd+P)
      if (isCmdOrCtrl && key === "p") {
        e.preventDefault();
        e.stopPropagation();
        protectNow(2000);
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

      // Intercept guest DevTools shortcuts
      if (
        !isAdmin &&
        (e.key === "F12" || (isCmdOrCtrl && e.shiftKey && (key === "i" || key === "j" || key === "c")))
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    };

    // 6. Keyup handler to track modifier release
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Shift" || e.key === "Control" || e.key === "Alt") {
        isModifierHeldRef.current = false;
        // Keep protected for 1.8 seconds after key release so OS capture captures blurred state
        if (unprotectTimerRef.current) {
          clearTimeout(unprotectTimerRef.current);
        }
        unprotectTimerRef.current = setTimeout(() => {
          if (document.hasFocus() && !document.hidden) {
            unprotectNow();
          }
        }, 1800);
      }
    };

    document.addEventListener("contextmenu", handleContextMenu, { capture: true });
    document.addEventListener("dragstart", handleDragStart, { capture: true });
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    window.addEventListener("blur", handleWindowBlur, { capture: true });
    window.addEventListener("focus", handleWindowFocus, { capture: true });
    document.addEventListener("visibilitychange", handleVisibilityChange, { capture: true });
    document.documentElement.addEventListener("mouseleave", handleMouseLeave, { capture: true });
    document.documentElement.addEventListener("mouseenter", handleMouseEnter, { capture: true });

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu, { capture: true });
      document.removeEventListener("dragstart", handleDragStart, { capture: true });
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
      window.removeEventListener("blur", handleWindowBlur, { capture: true });
      window.removeEventListener("focus", handleWindowFocus, { capture: true });
      document.removeEventListener("visibilitychange", handleVisibilityChange, { capture: true });
      document.documentElement.removeEventListener("mouseleave", handleMouseLeave, { capture: true });
      document.documentElement.removeEventListener("mouseenter", handleMouseEnter, { capture: true });
      document.documentElement.removeAttribute("data-screen-protected");
    };
  }, [enabled, isAdmin, protectNow, unprotectNow]);

  if (!enabled) {
    return null;
  }

  return (
    <>
      {/* Global CSS Guard: Touch Sheet Lockdown, Anti-Drag, Heavy Focus Blur, and Print Restriction */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            /* 1. Touch & Drag Protection (Works on iOS Safari, Android Chrome, and Desktop) */
            img, video, canvas, [data-photo-item], [data-slot="photo-card"] {
              -webkit-user-drag: none !important;
              -khtml-user-drag: none !important;
              -moz-user-drag: none !important;
              -o-user-drag: none !important;
              user-drag: none !important;
              -webkit-touch-callout: none !important; /* Completely blocks iOS Safari 'Save to Photos' long-press popup */
              user-select: none !important;
              -webkit-user-select: none !important;
            }

            /* 2. Anti-Snipping Focus Blur: Engaged during window blur, space switch, mouse leave, or Cmd+Shift */
            html[data-screen-protected="true"] img,
            html[data-screen-protected="true"] video,
            html[data-screen-protected="true"] canvas,
            html[data-screen-protected="true"] [data-photo-item],
            html[data-screen-protected="true"] .yet-another-react-lightbox,
            html[data-screen-protected="true"] [data-slot="photo-card"] {
              filter: blur(52px) saturate(0) brightness(0.4) !important;
              opacity: 0.1 !important;
              pointer-events: none !important;
              user-select: none !important;
              transition: filter 0.08s ease-out, opacity 0.08s ease-out !important;
            }

            /* 3. Strict Print Lockdown */
            @media print {
              html, body {
                visibility: hidden !important;
                height: 100% !important;
                overflow: hidden !important;
              }
              body::before {
                content: "Protected Media — Printing and digital capture are restricted on this gallery.";
                visibility: visible !important;
                display: block !important;
                text-align: center !important;
                padding-top: 120px !important;
                font-size: 20px !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                font-weight: 700 !important;
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

      {/* Floating Protected Notice displayed during active protection */}
      {isProtected && (
        <div
          className="fixed inset-0 z-[999999] pointer-events-none flex items-center justify-center backdrop-blur-3xl bg-black/40 transition-all duration-150"
          aria-hidden="true"
        >
          <div className="flex flex-col items-center gap-3 px-6 py-4 rounded-3xl bg-background/90 border border-primary/25 shadow-2xl backdrop-blur-2xl text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-inner">
              <ShieldAlert className="size-6" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-foreground tracking-wide">
                Protected Media Display
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Screen capture and recording are restricted — NayPict
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Alias export for clarity
export { RightClickGuard as MediaProtectionGuard };
