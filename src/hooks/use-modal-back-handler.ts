// This hook intercepts mobile browser and Android back gestures for dialogs, sheets, and drawers.

import { useEffect, useRef } from "react";

/**
 * Automatically intercepts Android / mobile browser back button/gestures
 * to close the active modal instead of leaving the page or closing parent views.
 *
 * @param open Current open state of the modal
 * @param onOpenChange Callback to update open state
 * @param disabled Optional flag to disable back interception
 */
export function useModalBackHandler(
  open: boolean,
  onOpenChange?: (open: boolean) => void,
  disabled = false
) {
  const isPushedRef = useRef(false);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (disabled || typeof window === "undefined") return;

    if (open) {
      // Push history state to capture back button/gesture
      const stateObj = { ...window.history.state, __modal_back_active: true };
      window.history.pushState(stateObj, "", window.location.href);
      isPushedRef.current = true;

      const handlePopState = () => {
        if (isPushedRef.current) {
          isPushedRef.current = false;
          onOpenChangeRef.current?.(false);
        }
      };

      window.addEventListener("popstate", handlePopState);

      return () => {
        window.removeEventListener("popstate", handlePopState);
        // If modal was closed via UI click instead of back gesture, pop the history state
        if (isPushedRef.current) {
          isPushedRef.current = false;
          if (window.history.state?.__modal_back_active) {
            window.history.back();
          }
        }
      };
    }
  }, [open, disabled]);
}
