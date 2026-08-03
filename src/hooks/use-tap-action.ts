import { useEffect, useRef } from "react"

const MOBILE_TAP_DELAY_MS = 50

// for Lightbox Inner action button generates event：Mobile terminal pointerup delayed trigger，PC / For keyboard click。
export function useTapAction(action: () => void) {
  // touchHandledRef Mark touch already on pointerup deal with，Avoid synthesis click Repeated trigger。
  const touchHandledRef = useRef(false)
  // touchTimerRef Save the timer triggered by the mobile terminal delay，Convenient to cancel the last time when touching repeatedly。
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current)
      }
    }
  }, [])

  // Delayed execution after the mobile terminal is lifted，stagger ghost click，Avoid accidentally touching the newly appeared UI。
  function onPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.pointerType !== "touch") {
      return
    }
    event.preventDefault()
    touchHandledRef.current = true
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current)
    }
    touchTimerRef.current = setTimeout(() => {
      touchTimerRef.current = null
      action()
    }, MOBILE_TAP_DELAY_MS)
  }

  // PC Mouse and keyboard go click；Touch is already there pointerup Processing is skipped。
  function onClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (touchHandledRef.current) {
      touchHandledRef.current = false
      return
    }
    action()
  }

  return { onPointerUp, onClick }
}
