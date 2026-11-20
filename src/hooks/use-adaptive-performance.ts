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

export type EcoModeOverride = "auto" | "force-on" | "force-off"

export interface AdaptivePerformanceState {
  isDataSaver: boolean
  isSlowNetwork: boolean
  isLowBattery: boolean
  isLowEndDevice: boolean
  isEcoMode: boolean
  canAutoplayVideo: boolean
  preferLightweightThumbnails: boolean
  ecoModeOverride: EcoModeOverride
}

const DEFAULT_STATE: AdaptivePerformanceState = {
  isDataSaver: false,
  isSlowNetwork: false,
  isLowBattery: false,
  isLowEndDevice: false,
  isEcoMode: false,
  canAutoplayVideo: true,
  preferLightweightThumbnails: false,
  ecoModeOverride: "auto",
}

let cachedState: AdaptivePerformanceState = DEFAULT_STATE
const listeners = new Set<() => void>()

function getHardwareInfo(): { isLowEndDevice: boolean } {
  if (typeof navigator === "undefined") return { isLowEndDevice: false }
  const nav = navigator as unknown as { deviceMemory?: number; hardwareConcurrency?: number }
  const memory = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null
  const cores = typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null

  // Constrained hardware profile: RAM <= 4GB or CPU <= 2 cores (budget smartphones & entry laptops)
  const isLowMemory = memory !== null && memory > 0 && memory <= 4
  const isLowCpu = cores !== null && cores > 0 && cores <= 2
  const isLowEndDevice = Boolean(isLowMemory || isLowCpu)

  return { isLowEndDevice }
}

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
  const nextDataSaver = partial.isDataSaver ?? cachedState.isDataSaver
  const nextSlowNetwork = partial.isSlowNetwork ?? cachedState.isSlowNetwork
  const nextLowBattery = partial.isLowBattery ?? cachedState.isLowBattery
  const nextLowEndDevice = partial.isLowEndDevice ?? cachedState.isLowEndDevice
  const nextOverride = partial.ecoModeOverride ?? cachedState.ecoModeOverride

  const autoEco = nextDataSaver || nextSlowNetwork || nextLowBattery || Boolean(nextLowEndDevice)
  const isEco = nextOverride === "force-on" ? true : nextOverride === "force-off" ? false : autoEco

  cachedState = {
    ...cachedState,
    ...partial,
    isDataSaver: nextDataSaver,
    isSlowNetwork: nextSlowNetwork,
    isLowBattery: nextLowBattery,
    isLowEndDevice: nextLowEndDevice,
    ecoModeOverride: nextOverride,
    isEcoMode: isEco,
    canAutoplayVideo: !isEco,
    preferLightweightThumbnails: isEco,
  }

  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("eco-mode", isEco)
  }

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

export function setEcoModeOverride(mode: EcoModeOverride) {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("naypict_eco_mode", mode)
    } catch {}
  }
  updateState({ ecoModeOverride: mode })
}

export function getEcoModeOverride(): EcoModeOverride {
  return cachedState.ecoModeOverride
}

// Global initialization of network and battery listeners
let initialized = false
function ensureInitialized() {
  if (initialized || typeof window === "undefined") return
  initialized = true

  // Read saved override if available
  let savedOverride: EcoModeOverride = "auto"
  try {
    const stored = localStorage.getItem("naypict_eco_mode")
    if (stored === "force-on" || stored === "force-off" || stored === "auto") {
      savedOverride = stored
    }
  } catch {}

  // 1. Initial network & hardware profile inspection
  const { isDataSaver, isSlowNetwork } = getNetworkInfo()
  const { isLowEndDevice } = getHardwareInfo()
  updateState({
    isDataSaver,
    isSlowNetwork,
    isLowEndDevice,
    ecoModeOverride: savedOverride,
  })

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
 * battery is under 20% and discharging, or when manually forced on.
 */
export function useAdaptivePerformance(): AdaptivePerformanceState {
  useEffect(() => {
    ensureInitialized()
  }, [])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
