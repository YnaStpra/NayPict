import * as React from "react"
import { cn } from "@/lib/utils"

export interface NaypictLogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string
  strokeWidth?: number
}

/**
 * NaypictLogo renders the official NayPict viewfinder camera brand mark.
 * Uses `stroke="currentColor"` so it automatically adapts to light and dark themes:
 * - In Light mode: renders crisp black / dark (`text-foreground`)
 * - In Dark mode: renders bright white (`text-foreground`)
 */
export function NaypictLogo({ className, strokeWidth = 18, ...props }: NaypictLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-7 text-foreground transition-colors shrink-0", className)}
      {...props}
    >
      {/* Viewfinder Frame Brackets */}
      <path d="M 166 96 L 96 96 L 96 166" />
      <path d="M 346 96 L 416 96 L 416 166" />
      <path d="M 96 346 L 96 416 L 166 416" />
      <path d="M 416 346 L 416 416 L 346 416" />

      {/* Horizon Line */}
      <line x1="84" y1="256" x2="428" y2="256" />

      {/* Perspective Road Lines */}
      <line x1="240" y1="256" x2="140" y2="396" />
      <line x1="272" y1="256" x2="372" y2="396" />
    </svg>
  )
}
