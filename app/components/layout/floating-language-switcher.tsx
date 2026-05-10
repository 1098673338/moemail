"use client"

import { useLocaleSwitcher } from "@/hooks/use-locale-switcher"
import { LOCALE_LABELS } from "@/i18n/config"
import { Button } from "@/components/ui/button"
import { FontSwitcher } from "@/components/theme/font-switcher"
import { Languages } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function FloatingLanguageSwitcher() {
  const { locale, locales, switchLocale } = useLocaleSwitcher()
  const controlButtonClass = "relative h-9 w-9 shrink-0 rounded-md border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
  const controlIconClass = "h-5 w-5"

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-1 rounded-lg border bg-white p-1.5 text-foreground shadow-lg">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={controlButtonClass}
            aria-label="Switch language"
          >
            <Languages className={controlIconClass} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="left">
          {locales.map((loc) => (
            <DropdownMenuItem
              key={loc}
              onClick={() => switchLocale(loc)}
              className={locale === loc ? "bg-accent" : ""}
            >
              {LOCALE_LABELS[loc]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <FontSwitcher
        buttonVariant="ghost"
        buttonClassName={controlButtonClass}
        iconClassName={controlIconClass}
      />
    </div>
  )
}
