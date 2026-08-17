"use client"

import { MoonIcon, SunIcon } from "lucide-react"
import { useApp } from "@/app/provider"

// Render the theme switch toggle button with smooth icon and switch animations.
export function ThemeSwitcher() {
  const { theme, toggleTheme } = useApp()
  const isDark = theme === "dark"

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex items-center justify-between gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent/80 transition-all cursor-pointer select-none"
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
    >
      <div className="flex items-center gap-2">
        {isDark ? (
          <MoonIcon className="size-4 text-indigo-400" />
        ) : (
          <SunIcon className="size-4 text-amber-500" />
        )}
        <span>{isDark ? "Dark Mode" : "Light Mode"}</span>
      </div>
      <div
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
          isDark ? "bg-primary" : "bg-neutral-300 dark:bg-neutral-700"
        }`}
      >
        <span
          className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
            isDark ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </div>
    </button>
  )
}
