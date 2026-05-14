"use client"

import { useCallback } from "react"
import { useTranslations } from "next-intl"
import { useToast } from "@/components/ui/use-toast"

interface UseCopyOptions {
  successMessage?: string
  errorMessage?: string
}

export function useCopy(options: UseCopyOptions = {}) {
  const { toast } = useToast()
  const tFeedback = useTranslations("common.feedback")
  const successMessage = options.successMessage ?? tFeedback("copySuccess")
  const errorMessage = options.errorMessage ?? tFeedback("copyFailed")

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({
        title: successMessage
      })
      return true
    } catch {
      toast({
        title: errorMessage,
        variant: "destructive"
      })
      return false
    }
  }, [successMessage, errorMessage, toast])

  return {
    copyToClipboard
  }
}
