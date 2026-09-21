"use client"

import { useEffect, useSyncExternalStore } from "react"

interface BatteryManager extends EventTarget {
  charging: boolean
  chargingTime: number
  dischargingTime: number
  level: number
  onchargingchange: ((this: BatteryManager, ev: Event) => void) | null
  onlevelchange: ((this: BatteryManager, ev: Event) => void) | null
}

interface NetworkInformation extends EventTarget {
  saveData?: boolean
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g"
  downlink?: number
  rtt?: number
  onchange?: ((this: NetworkInformation, ev: Event) => void) | null
}

interface AdaptivePerformanceState {
  isDataSaver: boolean
  isSlowNetwork: boolean
  isLowBattery: boolean
  isEcoMode: boolean
  canAutoplayVideo: boolean
  preferLightweightThumbnails: boolean
}

const DEFAULT_STATE: AdaptivePerformanceState = {
  isDataSaver: false,
  isSlowNetwork: false,
  isLowBattery: false,
  isEcoMode: false,
  canAutoplayVideo: true,
  preferLightweightThumbnails: false,
}

let cachedState: AdaptivePerformanceState = DEFAULT_STATE
const listeners = new Set<() => void>()

function getNetworkInfo(): { isDataSaver: boolean; isSlowNetwork: boolean } {
  if (typeof navigator === "undefined") return { isDataSaver: false, isSlowNetwork: false }
  const conn = (navigator as unknown as { connection?: NetworkInformation }).connection
  if (!conn) return { isDataSaver: false, isSlowNetwork: false }

  const isDataSaver = Boolean(conn.saveData)
  const isSlowNetwork =
    conn.effectiveType === "slow-2g" ||
    conn.effectiveType === "2g" ||
    conn.effectiveType === "3g" ||
    (typeof conn.downlink === "number" && conn.downlink < 1.5)

  return { isDataSaver, isSlowNetwork }
}

function updateState(partial: Partial<AdaptivePerformanceState>) {
  cachedState = { ...cachedState, ...partial }
  cachedState.isEcoMode = cachedState.isDataSaver || cachedState.isSlowNetwork || cachedState.isLowBattery
  cachedState.canAutoplayVideo = !cachedState.isEcoMode
  cachedState.preferLightweightThumbnails = cachedState.isEcoMode
  listeners.forEach((listener) => listener())
}

function subscribe(callback: () => void) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

function getSnapshot(): AdaptivePerformanceState {
  return cachedState
}

function getServerSnapshot(): AdaptivePerformanceState {
  return DEFAULT_STATE
}

// Global initialization of network and battery listeners
let initialized = false
function ensureInitialized() {
  if (initialized || typeof window === "undefined") return
  initialized = true

  // 1. Initial network inspection
  const { isDataSaver, isSlowNetwork } = getNetworkInfo()
  updateState({ isDataSaver, isSlowNetwork })

  // 2. Listen to network changes
  const conn = (navigator as unknown as { connection?: NetworkInformation }).connection
  if (conn && "addEventListener" in conn) {
    conn.addEventListener("change", () => {
      const net = getNetworkInfo()
      updateState({ isDataSaver: net.isDataSaver, isSlowNetwork: net.isSlowNetwork })
    })
  }

  // 3. Listen to battery status (if supported)
  const nav = navigator as unknown as { getBattery?: () => Promise<BatteryManager> }
  if (typeof nav.getBattery === "function") {
    nav.getBattery().then((battery) => {
      const handleBatteryUpdate = () => {
        const isLow = !battery.charging && battery.level <= 0.2
        updateState({ isLowBattery: isLow })
      }
      handleBatteryUpdate()
      battery.addEventListener("levelchange", handleBatteryUpdate)
      battery.addEventListener("chargingchange", handleBatteryUpdate)
    }).catch(() => {})
  }
}

/**
 * Reactive hook providing device & network adaptive performance metrics.
 * Automatically signals eco-mode when Data Saver is on, cellular network is weak (2G/3G),
 * or battery is under 20% and discharging.
 */
export function useAdaptivePerformance(): AdaptivePerformanceState {
  useEffect(() => {
    ensureInitialized()
  }, [])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
