"use client"

import type { ButtonProps } from "@/components/ui/button"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useFontPreference } from "@/hooks/use-font-preference"
import { cn } from "@/lib/utils"
import { Type } from "lucide-react"
import { useTranslations } from "next-intl"

interface FontSwitcherProps {
  buttonClassName?: string
  buttonVariant?: ButtonProps["variant"]
  contentAlign?: "start" | "center" | "end"
  contentSide?: "top" | "right" | "bottom" | "left"
  iconClassName?: string
}

export function FontSwitcher({
  buttonClassName,
  buttonVariant = "ghost",
  contentAlign = "center",
  contentSide = "bottom",
  iconClassName,
}: FontSwitcherProps) {
  const t = useTranslations("common.font")
  const { font, setFont, options } = useFontPreference()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={buttonVariant}
          size="icon"
          className={cn(buttonClassName)}
          aria-label={t("label")}
        >
          <Type className={cn("h-5 w-5", iconClassName)} />
          <span className="sr-only">{t("label")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={contentAlign} side={contentSide}>
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => setFont(option.value)}
            className={font === option.value ? "bg-accent" : ""}
          >
            {t(option.labelKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
