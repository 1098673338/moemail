"use client"

import { FontSwitcher } from "@/components/theme/font-switcher"

export function FloatingFontSwitcher() {
  const controlButtonClass = "relative h-9 w-9 shrink-0 rounded-md border-0 bg-transparent"
  const controlIconClass = "h-5 w-5"

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-1 rounded-lg border bg-white p-1.5 text-foreground shadow-lg">
      <FontSwitcher
        buttonVariant="ghost"
        buttonClassName={controlButtonClass}
        iconClassName={controlIconClass}
      />
    </div>
  )
}
