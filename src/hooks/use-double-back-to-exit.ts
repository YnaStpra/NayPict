// This hook implements the Android-standard "Press back again to exit" double-tap protection on the main gallery root.

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface UseDoubleBackToExitOptions {
  enabled?: boolean;
  timeoutMs?: number;
  message?: string;
}

export function useDoubleBackToExit({
  enabled = true,
  timeoutMs = 2000,
  message,
}: UseDoubleBackToExitOptions = {}) {
  const t = useTranslations("photos");
  const lastBackPressRef = useRef<number>(0);
  const isPushedRef = useRef(false);
  const exitMessage = message || t("pressBackAgainToExit") || "Press back again to exit";

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    // Push guard state on mount if not already present
    if (!window.history.state?.__root_back_guard) {
      window.history.pushState(
        { ...window.history.state, __root_back_guard: true },
        "",
        window.location.href
      );
      isPushedRef.current = true;
    }

    const handlePopState = () => {
      // If modal or sub-view just popped, ignore in root guard
      if (window.history.state?.__modal_back_active || window.history.state?.photoViewerOpen) {
        return;
      }

      const now = Date.now();
      const timeSinceLastPress = now - lastBackPressRef.current;

      if (lastBackPressRef.current > 0 && timeSinceLastPress <= timeoutMs) {
        // Second back press within timeout window: allow browser to exit
        lastBackPressRef.current = 0;
        isPushedRef.current = false;
        // Pop the root guard so browser exits
        window.history.back();
      } else {
        // First back press: inform user and re-push guard state
        lastBackPressRef.current = now;
        toast.info(exitMessage, {
          duration: timeoutMs,
          id: "double-back-exit-toast",
        });

        // Re-push guard state immediately to catch the next back press
        window.history.pushState(
          { ...window.history.state, __root_back_guard: true },
          "",
          window.location.href
        );
        isPushedRef.current = true;
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [enabled, timeoutMs, exitMessage]);
}
