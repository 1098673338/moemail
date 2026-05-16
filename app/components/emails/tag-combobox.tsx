"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface TagComboboxProps {
  id: string
  value: string
  options: string[]
  placeholder: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onValueChange: (value: string) => void
  maxLength?: number
  "aria-label"?: string
}

interface MenuPosition {
  left: number
  top?: number
  bottom?: number
  width: number
  maxHeight: number
  side: "top" | "bottom"
}

const MENU_OFFSET = 4
const VIEWPORT_PADDING = 16
const MENU_MAX_HEIGHT = 264
const MENU_MIN_HEIGHT = 120

export function TagCombobox({
  id,
  value,
  options,
  placeholder,
  open,
  onOpenChange,
  onValueChange,
  maxLength,
  "aria-label": ariaLabel,
}: TagComboboxProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)

  const normalizedOptions = useMemo(() => (
    Array.from(new Set(options.map(option => option.trim()).filter(Boolean)))
  ), [options])

  const getLimitedValue = (nextValue: string) => (
    typeof maxLength === "number" ? nextValue.slice(0, maxLength) : nextValue
  )

  const getVisibleOptions = (nextValue: string) => {
    const keyword = nextValue.trim().toLowerCase()
    if (!keyword) return normalizedOptions

    return normalizedOptions.filter(option => option.toLowerCase().includes(keyword))
  }

  const visibleOptions = useMemo(() => (
    normalizedOptions.filter(option => {
      const keyword = value.trim().toLowerCase()
      if (!keyword) return true

      return option.toLowerCase().includes(keyword)
    })
  ), [normalizedOptions, value])
  const menuOpen = open && visibleOptions.length > 0

  const updateValue = (nextValue: string) => {
    onValueChange(getLimitedValue(nextValue))
  }

  const updateMenuPosition = useCallback(() => {
    const root = rootRef.current
    if (!root) return

    const rect = root.getBoundingClientRect()
    const availableBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING - MENU_OFFSET
    const availableAbove = rect.top - VIEWPORT_PADDING - MENU_OFFSET
    const openAbove = availableBelow < MENU_MIN_HEIGHT && availableAbove > availableBelow
    const availableHeight = openAbove ? availableAbove : availableBelow
    const maxHeight = Math.max(MENU_MIN_HEIGHT, Math.min(MENU_MAX_HEIGHT, availableHeight))

    setMenuPosition({
      left: rect.left,
      width: rect.width,
      maxHeight,
      side: openAbove ? "top" : "bottom",
      ...(openAbove
        ? { bottom: window.innerHeight - rect.top + MENU_OFFSET }
        : { top: rect.bottom + MENU_OFFSET }
      ),
    })
  }, [])

  const handleComboboxOpenChange = (nextOpen: boolean) => {
    if (nextOpen && visibleOptions.length === 0) {
      onOpenChange(false)
      return
    }
    onOpenChange(nextOpen)
  }

  const handleInputChange = (nextValue: string) => {
    const limitedValue = getLimitedValue(nextValue)
    const nextOptions = getVisibleOptions(limitedValue)

    onValueChange(limitedValue)

    if (nextOptions.length > 0) {
      onOpenChange(true)
      return
    }

    onOpenChange(false)
  }

  useEffect(() => {
    if (open && visibleOptions.length === 0) {
      onOpenChange(false)
    }
  }, [open, onOpenChange, visibleOptions.length])

  useEffect(() => {
    if (!open) return

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node
        && (rootRef.current?.contains(event.target) || menuRef.current?.contains(event.target))
      ) {
        return
      }

      onOpenChange(false)
    }

    document.addEventListener("pointerdown", closeOnOutsidePointerDown)

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown)
    }
  }, [open, onOpenChange])

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null)
      return
    }

    updateMenuPosition()
  }, [menuOpen, updateMenuPosition, visibleOptions.length])

  useEffect(() => {
    if (!menuOpen) return

    const handlePositionChange = () => updateMenuPosition()

    window.addEventListener("resize", handlePositionChange)
    window.addEventListener("scroll", handlePositionChange, true)

    return () => {
      window.removeEventListener("resize", handlePositionChange)
      window.removeEventListener("scroll", handlePositionChange, true)
    }
  }, [menuOpen, updateMenuPosition])

  const menu = menuOpen && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={menuRef}
          data-dialog-interaction-guard
          role="listbox"
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
          className="pointer-events-auto fixed z-[70] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground animate-in data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
          style={{
            left: menuPosition?.left ?? 0,
            top: menuPosition?.top,
            bottom: menuPosition?.bottom,
            width: menuPosition?.width,
            maxHeight: menuPosition?.maxHeight,
            visibility: menuPosition ? "visible" : "hidden",
          }}
          data-side={menuPosition?.side ?? "bottom"}
        >
          {visibleOptions.map(option => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={false}
              onMouseDown={(event) => event.preventDefault()}
              className="relative flex w-full min-w-0 cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
              onClick={() => {
                updateValue(option)
                handleComboboxOpenChange(false)
              }}
            >
              <span className="min-w-0 truncate">{option}</span>
            </button>
          ))}
        </div>,
        document.body
      )
    : null

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <div className="flex h-9 min-w-0 items-center rounded-md border border-input bg-background transition-colors focus-within:ring-1 focus-within:ring-ring">
        <Input
          id={id}
          value={value}
          maxLength={maxLength}
          onFocus={() => handleComboboxOpenChange(true)}
          onChange={(event) => {
            handleInputChange(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              handleComboboxOpenChange(false)
            }
          }}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={menuOpen}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 py-1 focus-visible:ring-0"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={ariaLabel}
          aria-expanded={menuOpen}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => handleComboboxOpenChange(!menuOpen)}
          className="h-full w-10 shrink-0 rounded-l-none rounded-r-md hover:bg-transparent hover:text-current"
        >
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </div>

      {menu}
    </div>
  )
}
