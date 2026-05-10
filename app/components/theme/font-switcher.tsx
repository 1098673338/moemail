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
import { Check, Type } from "lucide-react"
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
  contentAlign = "end",
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
          className={cn("rounded-full", buttonClassName)}
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
            className="gap-2"
          >
            <Check
              className={cn(
                "h-4 w-4",
                font === option.value ? "opacity-100" : "opacity-0"
              )}
            />
            <span>{t(option.labelKey)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
