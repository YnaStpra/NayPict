import { type ReactNode } from "react"

interface SettingItemProps {
  // title Is the title displayed on the left side of the setting item.
  title: string
  // description is the description below the title of the setting item.
  description?: string
  // children It is the custom content on the right side of the setting item.
  children: ReactNode
}

// Render a single setting item in the system settings page.
export function SettingItem({ title, description, children }: SettingItemProps) {
  return (
    <div>
      <div className="flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between py-3 md:py-5">
        <div className="min-w-0 space-y-1 md:w-1/2">
          <h2 className="text-base font-medium">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex w-full items-center justify-start md:w-1/2">
          {children}
        </div>
      </div>
    </div>
  )
}
