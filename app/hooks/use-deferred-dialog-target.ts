"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const DEFAULT_CLEAR_DELAY = 220

export function useDeferredDialogTarget<T>(clearDelay = DEFAULT_CLEAR_DELAY) {
  const [target, setTarget] = useState<T | null>(null)
  const [open, setOpen] = useState(false)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (!clearTimerRef.current) return
    clearTimeout(clearTimerRef.current)
    clearTimerRef.current = null
  }, [])

  const openWithTarget = useCallback((nextTarget: T) => {
    clearTimer()
    setTarget(nextTarget)
    setOpen(true)
  }, [clearTimer])

  const close = useCallback(() => {
    setOpen(false)
    clearTimer()
    clearTimerRef.current = setTimeout(() => {
      setTarget(null)
      clearTimerRef.current = null
    }, clearDelay)
  }, [clearDelay, clearTimer])

  const clearNow = useCallback(() => {
    clearTimer()
    setOpen(false)
    setTarget(null)
  }, [clearTimer])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      clearTimer()
      setOpen(true)
      return
    }

    close()
  }, [clearTimer, close])

  useEffect(() => clearTimer, [clearTimer])

  return {
    target,
    open,
    openWithTarget,
    close,
    clearNow,
    handleOpenChange,
  }
}
