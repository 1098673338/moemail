"use client"

import { useCallback, useEffect, useState } from "react"

export const FONT_STORAGE_KEY = "moemail-font"

export const FONT_OPTIONS = [
  { value: "pixel", labelKey: "options.pixel" },
  { value: "system", labelKey: "options.system" },
] as const

export type FontOption = (typeof FONT_OPTIONS)[number]["value"]

export const DEFAULT_FONT: FontOption = "pixel"

export function isFontOption(value: string | null): value is FontOption {
  return FONT_OPTIONS.some((option) => option.value === value)
}

function normalizeFontOption(value: string | null): FontOption {
  if (value === "sans") {
    return "system"
  }

  return isFontOption(value) ? value : DEFAULT_FONT
}

function getStoredFont(): FontOption {
  if (typeof window === "undefined") {
    return DEFAULT_FONT
  }

  const storedFont = window.localStorage.getItem(FONT_STORAGE_KEY)
  return normalizeFontOption(storedFont)
}

function applyFont(font: FontOption) {
  document.documentElement.dataset.font = font
}

export function useFontPreference() {
  const [font, setFontState] = useState<FontOption>(DEFAULT_FONT)

  useEffect(() => {
    const currentFont = getStoredFont()
    setFontState(currentFont)
    applyFont(currentFont)

    const handleFontChange = (event: Event) => {
      const nextFont = (event as CustomEvent<FontOption>).detail

      if (isFontOption(nextFont)) {
        setFontState(nextFont)
      }
    }

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === FONT_STORAGE_KEY) {
        const nextFont = normalizeFontOption(event.newValue)
        setFontState(nextFont)
        applyFont(nextFont)
      }
    }

    window.addEventListener("moemail-font-change", handleFontChange)
    window.addEventListener("storage", handleStorageChange)

    return () => {
      window.removeEventListener("moemail-font-change", handleFontChange)
      window.removeEventListener("storage", handleStorageChange)
    }
  }, [])

  const setFont = useCallback((nextFont: FontOption) => {
    setFontState(nextFont)
    applyFont(nextFont)
    window.localStorage.setItem(FONT_STORAGE_KEY, nextFont)
    window.dispatchEvent(new CustomEvent("moemail-font-change", { detail: nextFont }))
  }, [])

  return {
    font,
    setFont,
    options: FONT_OPTIONS,
  }
}
