"use client"

import type { ButtonProps } from "@/components/ui/button"
import { Button } from "@/components/ui/button"
import { useFontPreference } from "@/hooks/use-font-preference"
import { cn } from "@/lib/utils"
import { Type } from "lucide-react"
import { useTranslations } from "next-intl"

interface FontSwitcherProps {
  buttonClassName?: string
  buttonVariant?: ButtonProps["variant"]
  iconClassName?: string
}

export function FontSwitcher({
  buttonClassName,
  buttonVariant = "ghost",
  iconClassName,
}: FontSwitcherProps) {
  const t = useTranslations("common.font")
  const { font, setFont } = useFontPreference()
  const nextFont = font === "pixel" ? "system" : "pixel"

  return (
    <Button
      variant={buttonVariant}
      size="icon"
      onClick={() => setFont(nextFont)}
      className={cn("relative", buttonClassName)}
      aria-label={t("label")}
      title={t(nextFont === "pixel" ? "options.pixel" : "options.system")}
    >
      <Type className={cn("h-5 w-5", iconClassName)} />
      <span className="sr-only">{t("label")}</span>
    </Button>
  )
}
