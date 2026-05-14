"use client"

import { useState, useEffect, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Share2, Copy, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { useCopy } from "@/hooks/use-copy"
import { EXPIRY_OPTIONS } from "@/types/email"

interface ShareDialogProps {
  emailId: string
  emailAddress: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: ReactNode | null
}

interface ShareLink {
  id: string
  token: string
  createdAt: number | string | Date
  expiresAt: number | string | Date | null
  enabled: boolean
}

export function ShareDialog({ emailId, open: controlledOpen, onOpenChange, trigger }: ShareDialogProps) {
  const t = useTranslations("emails.share")
  const tFeedback = useTranslations("common.feedback")
  const { toast } = useToast()
  const { copyToClipboard } = useCopy()

  const [internalOpen, setInternalOpen] = useState(false)
  const [shares, setShares] = useState<ShareLink[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [expiryTime, setExpiryTime] = useState(EXPIRY_OPTIONS[1].value.toString())
  const [deleteTarget, setDeleteTarget] = useState<ShareLink | null>(null)
  const [deleting, setDeleting] = useState(false)
  const open = controlledOpen ?? internalOpen

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setDeleteTarget(null)
      setDeleting(false)
    }
    setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  const fetchShares = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/emails/${emailId}/share`)
      if (!response.ok) throw new Error("Failed to fetch shares")

      const data = await response.json() as { shares: ShareLink[] }
      setShares(data.shares || [])
    } catch (error) {
      console.error("Failed to fetch shares:", error)
      toast({
        title: t("createFailed"),
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const createShare = async () => {
    try {
      setCreating(true)
      const response = await fetch(`/api/emails/${emailId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: Number(expiryTime) })
      })

      if (!response.ok) throw new Error("Failed to create share")

      const share = await response.json() as ShareLink
      setShares(prev => [share, ...prev])

      toast({
        title: t("createSuccess"),
      })
    } catch (error) {
      console.error("Failed to create share:", error)
      toast({
        title: t("createFailed"),
        variant: "destructive"
      })
    } finally {
      setCreating(false)
    }
  }

  const deleteShare = async (share: ShareLink) => {
    try {
      setDeleting(true)
      const response = await fetch(`/api/emails/${emailId}/share/${share.id}`, {
        method: "DELETE"
      })

      if (!response.ok) throw new Error("Failed to delete share")

      setShares(prev => prev.filter(s => s.id !== share.id))

      toast({
        title: tFeedback("deleteSuccess"),
      })
    } catch (error) {
      console.error("Failed to delete share:", error)
      toast({
        title: tFeedback("deleteFailed"),
        variant: "destructive"
      })
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  const getShareUrl = (token: string) => {
    return `${window.location.origin}/shared/${token}`
  }

  const handleCopy = async (token: string) => {
    const url = getShareUrl(token)
    await copyToClipboard(url)
  }

  useEffect(() => {
    if (open) {
      fetchShares()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        {trigger !== null && (
          <DialogTrigger asChild>
            {trigger ?? (
              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-black/10">
                <Share2 className="h-4 w-4" />
              </Button>
            )}
          </DialogTrigger>
        )}
        <DialogContent
          className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-[600px] max-h-[calc(100vh-2rem)] overflow-hidden p-4 sm:p-6"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{deleteTarget ? t("deleteConfirm") : t("title")}</DialogTitle>
            <DialogDescription>
              {deleteTarget ? t("deleteDescription") : t("description")}
            </DialogDescription>
          </DialogHeader>

          {deleteTarget ? (
            <div className="flex flex-col gap-4 pt-2">
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteTarget(null)}
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  disabled={deleting}
                  className="bg-destructive hover:bg-destructive/90"
                  onClick={() => deleteShare(deleteTarget)}
                >
                  {t("delete")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="min-h-0 -mx-1 space-y-4 overflow-y-auto px-1 py-1">
              {/* Create new share link */}
              <div className="space-y-2">
                <Label>{t("expiryTime")}</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select value={expiryTime} onValueChange={setExpiryTime}>
                    <SelectTrigger className="w-full sm:flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPIRY_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value.toString()}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    onClick={createShare}
                    disabled={creating}
                    className="w-full sm:w-auto sm:min-w-[100px]"
                  >
                    {creating ? t("creating") : t("createLink")}
                  </Button>
                </div>
              </div>

              {/* Active share links */}
              <div className="space-y-2">
                <Label>{t("activeLinks")}</Label>
                <div className="min-h-[92px] max-h-[270px] overflow-y-auto">
                  {loading ? (
                    <div className="flex min-h-[92px] flex-col items-center justify-center gap-2 text-center text-sm text-gray-500">
                      <div className="w-5 h-5 border border-primary/30 border-t-primary rounded-full animate-spin" />
                      <span>{t("loading")}</span>
                    </div>
                  ) : shares.length === 0 ? (
                    <div className="flex min-h-[92px] items-center justify-center text-center text-sm text-gray-500">
                      {t("noLinks")}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {shares.map(share => {
                        // 将expiresAt转换为时间戳进行比较
                        const expiresAtTime = share.expiresAt
                          ? (typeof share.expiresAt === 'number'
                            ? share.expiresAt
                            : new Date(share.expiresAt).getTime())
                          : null
                        const isExpired = expiresAtTime !== null && expiresAtTime < Date.now()
                        return (
                          <div
                            key={share.id}
                            className={cn(
                              "p-3 border rounded-lg space-y-2 transition-all",
                              isExpired
                                ? "border-destructive/30 bg-destructive/5 opacity-75"
                                : "border-border"
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <a
                                href={isExpired ? undefined : getShareUrl(share.token)}
                                target={isExpired ? undefined : "_blank"}
                                rel={isExpired ? undefined : "noopener noreferrer"}
                                onClick={(e) => {
                                  if (isExpired) {
                                    e.preventDefault()
                                  }
                                }}
                                className={cn(
                                  "flex h-8 min-w-0 flex-1 items-center rounded-md px-2 text-xs font-mono transition-colors",
                                  isExpired
                                    ? "bg-destructive/10 text-destructive/70 cursor-not-allowed pointer-events-none"
                                    : "bg-gray-100 text-gray-700 hover:text-primary cursor-pointer"
                                )}
                              >
                                <span className="min-w-0 truncate">{getShareUrl(share.token)}</span>
                              </a>
                              <div className="flex flex-shrink-0 gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleCopy(share.token)}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setDeleteTarget(share)}
                                >
                                  <Trash2 className="h-4 w-4 text-black" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-y-1 gap-x-2 sm:gap-x-4 text-xs">
                              <span className={cn(
                                "break-words",
                                isExpired ? "text-destructive/70" : "text-gray-500"
                              )}>
                                {t("createdAt")}: {new Date(
                                  typeof share.createdAt === 'number'
                                    ? share.createdAt
                                    : share.createdAt
                                ).toLocaleString()}
                              </span>
                              <span className={cn(
                                "break-words",
                                isExpired ? "text-destructive/70" : "text-gray-500"
                              )}>
                                {t("expiresAt")}: {
                                  share.expiresAt
                                    ? new Date(
                                      typeof share.expiresAt === 'number'
                                        ? share.expiresAt
                                        : share.expiresAt
                                    ).toLocaleString()
                                    : t("permanent")
                                }
                              </span>
                              {isExpired && (
                                <span className="text-destructive font-medium flex items-center gap-1">
                                  <span className="w-2 h-2 bg-destructive rounded-full"></span>
                                  {t("expired")}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
