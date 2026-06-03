"use client"

import { type ReactNode, useState, useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Mail, MailX, RefreshCw, Trash2, Share2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useThrottle } from "@/hooks/use-throttle"
import { EMAIL_CONFIG } from "@/config"
import { useToast } from "@/components/ui/use-toast"
import { useDeferredDialogTarget } from "@/hooks/use-deferred-dialog-target"
import { ShareMessageDialog } from "./share-message-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";

interface Message {
  id: string
  from_address?: string
  to_address?: string
  subject: string
  received_at?: number
  sent_at?: number
  content?: string
  html?: string
}

interface MessageListProps {
  email: {
    id: string
    address: string
    isCustom?: boolean
  }
  messageType: MessageType
  onMessageSelect: (messageId: string | null, messageType?: MessageType, message?: Message) => void
  onMessagePrefetch?: (messageId: string, messageType: MessageType, message: Message) => void | Promise<unknown>
  selectedMessageId?: string | null
  refreshTrigger?: number
  emptyStateOffsetClass?: string
  onTotalChange?: (messageType: MessageType, total: number) => void
  tabControls?: ReactNode
  onBeforeRefresh?: (messageType: MessageType) => Promise<void> | void
  onBeforeAutoRefresh?: (messageType: MessageType, emailId: string) => Promise<void> | void
  autoRefreshInterval?: number
  autoRefreshEnabled?: boolean
  isIcloudMail?: boolean
}

interface MessageResponse {
  messages: Message[]
  nextCursor: string | null
  total: number
}

type MessageType = 'received' | 'sent'
const AUTO_PREFETCH_MESSAGE_COUNT = 5

export function MessageList({ email, messageType, onMessageSelect, onMessagePrefetch, selectedMessageId, refreshTrigger, emptyStateOffsetClass, onTotalChange, tabControls, onBeforeRefresh, onBeforeAutoRefresh, autoRefreshInterval = EMAIL_CONFIG.POLL_INTERVAL, autoRefreshEnabled = true, isIcloudMail = false }: MessageListProps) {
  const t = useTranslations("emails.messages")
  const tCommon = useTranslations("common.actions")
  const tFeedback = useTranslations("common.feedback")
  const isCustomEmail = Boolean(email.isCustom)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(!isCustomEmail)
  const [refreshing, setRefreshing] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesRef = useRef<Message[]>([]) // 添加 ref 来追踪最新的消息列表
  const loadingRef = useRef(loading)
  const refreshingRef = useRef(refreshing)
  const loadingMoreRef = useRef(loadingMore)
  const refreshInFlightRef = useRef(false)
  const autoRefreshInFlightRef = useRef(false)
  const onBeforeAutoRefreshRef = useRef(onBeforeAutoRefresh)
  const pendingDeletedMessageIdsRef = useRef<Set<string>>(new Set())
  const mountedRef = useRef(true)
  const requestContextRef = useRef({ emailId: email.id, messageType })
  const [total, setTotal] = useState(0)
  const messageDeleteDialog = useDeferredDialogTarget<Message>()
  const messageToDelete = messageDeleteDialog.target
  const { toast } = useToast()

  requestContextRef.current = { emailId: email.id, messageType }

  const isCurrentRequest = (emailId: string, requestMessageType: MessageType) => (
    mountedRef.current
    &&
    requestContextRef.current.emailId === emailId
    && requestContextRef.current.messageType === requestMessageType
  )

  const updateTotal = (nextTotal: number) => {
    const normalizedTotal = Math.max(nextTotal, 0)
    setTotal(normalizedTotal)
    onTotalChange?.(messageType, normalizedTotal)
  }

  const adjustTotal = (delta: number) => {
    setTotal(prev => {
      const nextTotal = Math.max(prev + delta, 0)
      onTotalChange?.(messageType, nextTotal)
      return nextTotal
    })
  }

  const filterPendingDeletedMessages = (nextMessages: Message[]) => {
    const pendingDeletedMessageIds = pendingDeletedMessageIdsRef.current
    if (pendingDeletedMessageIds.size === 0) return nextMessages

    return nextMessages.filter(message => !pendingDeletedMessageIds.has(message.id))
  }

  const getVisibleTotal = (serverTotal: number) => {
    return Math.max(serverTotal - pendingDeletedMessageIdsRef.current.size, 0)
  }

  const removeMessageFromList = (messageId: string) => {
    const nextMessages = messagesRef.current.filter(message => message.id !== messageId)
    messagesRef.current = nextMessages
    setMessages(nextMessages)
  }

  const restoreMessageToList = (message: Message, index: number) => {
    if (messagesRef.current.some(currentMessage => currentMessage.id === message.id)) return

    const nextMessages = [...messagesRef.current]
    nextMessages.splice(Math.min(Math.max(index, 0), nextMessages.length), 0, message)
    messagesRef.current = nextMessages
    setMessages(nextMessages)
  }

  // 当 messages 改变时更新 ref
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    loadingRef.current = loading
  }, [loading])

  useEffect(() => {
    refreshingRef.current = refreshing
  }, [refreshing])

  useEffect(() => {
    loadingMoreRef.current = loadingMore
  }, [loadingMore])

  useEffect(() => {
    onBeforeAutoRefreshRef.current = onBeforeAutoRefresh
  }, [onBeforeAutoRefresh])

  useEffect(() => {
    pendingDeletedMessageIdsRef.current.clear()
  }, [email.id, messageType])

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (isCustomEmail || loading || refreshing || loadingMore || !onMessagePrefetch || messages.length === 0) return

    let cancelled = false

    const prefetchMessages = async () => {
      for (const message of messages.slice(0, AUTO_PREFETCH_MESSAGE_COUNT)) {
        if (cancelled) return

        await Promise.resolve()
          .then(() => onMessagePrefetch(message.id, messageType, message))
          .catch(() => undefined)
      }
    }

    void prefetchMessages()

    return () => {
      cancelled = true
    }
  }, [isCustomEmail, loading, loadingMore, messageType, messages, onMessagePrefetch, refreshing])

  const fetchMessages = async (cursor?: string, replace = false) => {
    if (isCustomEmail) {
      setMessages([])
      setNextCursor(null)
      updateTotal(0)
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
      return
    }

    const requestEmailId = email.id
    const requestMessageType = messageType

    try {
      const url = new URL(`/api/emails/${requestEmailId}`, window.location.origin)
      if (requestMessageType === 'sent') {
        url.searchParams.set('type', 'sent')
      }
      url.searchParams.set('summary', '1')
      if (cursor) {
        url.searchParams.set('cursor', cursor)
      }
      url.searchParams.set('_', String(Date.now()))

      const response = await fetch(url, {
        cache: 'no-store',
      })
      const data = await response.json() as MessageResponse

      if (!isCurrentRequest(requestEmailId, requestMessageType)) {
        return
      }
      
      if (!cursor) {
        const newMessages = filterPendingDeletedMessages(data.messages)
        const visibleTotal = getVisibleTotal(data.total)
        if (replace) {
          setMessages(newMessages)
          setNextCursor(data.nextCursor)
          updateTotal(visibleTotal)
          return
        }

        const oldMessages = filterPendingDeletedMessages(messagesRef.current)

        const lastDuplicateIndex = newMessages.findIndex(
          newMsg => oldMessages.some(oldMsg => oldMsg.id === newMsg.id)
        )

        if (lastDuplicateIndex === -1) {
          setMessages(newMessages)
          setNextCursor(data.nextCursor)
          updateTotal(visibleTotal)
          return
        }
        const uniqueNewMessages = newMessages.slice(0, lastDuplicateIndex)
        setNextCursor(data.nextCursor)
        if (uniqueNewMessages.length === 0) {
          updateTotal(visibleTotal)
          return
        }
        setMessages([...uniqueNewMessages, ...oldMessages])
        updateTotal(visibleTotal)
        return
      }
      setMessages(prev => [...filterPendingDeletedMessages(prev), ...filterPendingDeletedMessages(data.messages)])
      setNextCursor(data.nextCursor)
      updateTotal(getVisibleTotal(data.total))
    } catch (error) {
      console.error("Failed to fetch messages:", error)
    } finally {
      if (isCurrentRequest(requestEmailId, requestMessageType)) {
        setLoading(false)
        setRefreshing(false)
        setLoadingMore(false)
      }
    }
  }

  const stopPolling = () => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }

  const runAutoRefresh = async () => {
    if (!autoRefreshEnabled || autoRefreshInFlightRef.current) return

    autoRefreshInFlightRef.current = true
    const requestEmailId = email.id
    const requestMessageType = messageType

    try {
      await onBeforeAutoRefreshRef.current?.(requestMessageType, requestEmailId)

      if (isCurrentRequest(requestEmailId, requestMessageType)) {
        await fetchMessages()
      }
    } catch (error) {
      console.error("Failed to auto refresh messages:", error)
    } finally {
      autoRefreshInFlightRef.current = false
    }
  }

  const startPolling = () => {
    stopPolling()
    if (!autoRefreshEnabled) return

    const tick = () => {
      pollTimeoutRef.current = null

      if (
        !loadingRef.current
        && !refreshingRef.current
        && !loadingMoreRef.current
        && !refreshInFlightRef.current
        && !autoRefreshInFlightRef.current
      ) {
        void runAutoRefresh().finally(() => {
          if (isCurrentRequest(email.id, messageType) && autoRefreshEnabled) {
            pollTimeoutRef.current = setTimeout(tick, autoRefreshInterval)
          }
        })
        return
      }

      if (isCurrentRequest(email.id, messageType) && autoRefreshEnabled) {
        pollTimeoutRef.current = setTimeout(tick, Math.min(autoRefreshInterval, 1_000))
      }
    }

    pollTimeoutRef.current = setTimeout(tick, autoRefreshInterval)
  }

  const handleRefresh = async () => {
    if (isCustomEmail) {
      setMessages([])
      setNextCursor(null)
      updateTotal(0)
      setRefreshing(false)
      return
    }

    if (refreshInFlightRef.current || loadingRef.current || refreshingRef.current || loadingMoreRef.current) {
      return
    }

    refreshInFlightRef.current = true
    stopPolling()
    setRefreshing(true)
    let shouldFetchMessages = true

    try {
      await onBeforeRefresh?.(messageType)
    } catch (error) {
      console.error("Failed to run refresh hook:", error)
      shouldFetchMessages = false
      toast({
        title: error instanceof Error ? error.message : tFeedback("refreshFailed"),
        variant: "destructive"
      })
    }

    try {
      if (shouldFetchMessages) {
        await fetchMessages(undefined, true)
      } else {
        setRefreshing(false)
      }
    } finally {
      refreshInFlightRef.current = false
      if (!isCustomEmail && email.id) {
        startPolling()
      }
    }
  }

  const handleScroll = useThrottle((e: React.UIEvent<HTMLDivElement>) => {
    if (loadingMore) return

    const { scrollHeight, scrollTop, clientHeight } = e.currentTarget
    const threshold = clientHeight * 1.5
    const remainingScroll = scrollHeight - scrollTop

    if (remainingScroll <= threshold && nextCursor) {
      setLoadingMore(true)
      fetchMessages(nextCursor)
    }
  }, 200)

  const handleDelete = async (message: Message) => {
    const shouldOptimisticallyDelete = isIcloudMail && messageType === "received"
    const previousIndex = messagesRef.current.findIndex(currentMessage => currentMessage.id === message.id)

    if (shouldOptimisticallyDelete) {
      pendingDeletedMessageIdsRef.current.add(message.id)
      removeMessageFromList(message.id)
      adjustTotal(-1)

      if (selectedMessageId === message.id) {
        onMessageSelect(null)
      }
    }

    messageDeleteDialog.close()

    try {
      const response = await fetch(`/api/emails/${email.id}/${message.id}${messageType === 'sent' ? '?type=sent' : ''}`, {
        method: "DELETE"
      })

      if (!response.ok) {
        const data = await response.json()

        if (shouldOptimisticallyDelete) {
          pendingDeletedMessageIdsRef.current.delete(message.id)
          restoreMessageToList(message, previousIndex)
          adjustTotal(1)
        }

        toast({
          title: (data as { error?: string }).error || tFeedback("deleteFailed"),
          variant: "destructive"
        })
        return
      }

      pendingDeletedMessageIdsRef.current.delete(message.id)

      if (!shouldOptimisticallyDelete) {
        removeMessageFromList(message.id)
        adjustTotal(-1)

        if (selectedMessageId === message.id) {
          onMessageSelect(null)
        }
      }

      toast({
        title: tFeedback("deleteSuccess")
      })
    } catch {
      if (shouldOptimisticallyDelete) {
        pendingDeletedMessageIdsRef.current.delete(message.id)
        restoreMessageToList(message, previousIndex)
        adjustTotal(1)
      }

      toast({
        title: tFeedback("deleteFailed"),
        variant: "destructive"
      })
    }
  }

  useEffect(() => {
    if (!email.id) {
      return
    }
    if (isCustomEmail) {
      stopPolling()
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
      setMessages([])
      setNextCursor(null)
      updateTotal(0)
      return
    }
    loadingRef.current = true
    setLoading(true)
    setRefreshing(false)
    setLoadingMore(false)
    setNextCursor(null)

    const loadMessages = async () => {
      await fetchMessages(undefined, true)

      if (autoRefreshEnabled && onBeforeAutoRefreshRef.current) {
        await runAutoRefresh()
      }
    }

    void loadMessages()
    startPolling()

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible"
        && autoRefreshEnabled
        && !loadingRef.current
        && !refreshingRef.current
        && !loadingMoreRef.current
        && !refreshInFlightRef.current
        && !autoRefreshInFlightRef.current
      ) {
        stopPolling()
        void runAutoRefresh().finally(() => {
          if (isCurrentRequest(email.id, messageType) && autoRefreshEnabled) {
            startPolling()
          }
        })
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      stopPolling() 
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email.id, isCustomEmail, autoRefreshEnabled, autoRefreshInterval, messageType])

  useEffect(() => {
    if (isCustomEmail) {
      setMessages([])
      setNextCursor(null)
      updateTotal(0)
      setRefreshing(false)
      return
    }

    if (refreshTrigger && refreshTrigger > 0) {
      setRefreshing(true)
      fetchMessages(undefined, true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger, isCustomEmail])

  return (
  <>
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={loading || refreshing || loadingMore}
            className={cn("h-8 w-8 shrink-0", refreshing && "animate-spin")}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          {tabControls}
        </div>
        <span className="text-xs text-gray-500">
          {total > 0 ? `${total} ${t("messageCount")}` : t("noMessages")}
        </span>
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-auto p-2",
          (loading || refreshing || (!loading && messages.length === 0)) && "flex"
        )}
        onScroll={handleScroll}
      >
        {loading || refreshing ? (
          <div className={cn("flex flex-1 flex-col items-center justify-center px-6 text-center text-sm text-gray-500", emptyStateOffsetClass)}>
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary/40" />
            <p>{t("loading")}</p>
          </div>
        ) : messages.length > 0 ? (
          <div className="space-y-1">
            {messages.map(message => (
              <div
                key={message.id}
                onClick={() => onMessageSelect(message.id, messageType, message)}
                onFocus={() => onMessagePrefetch?.(message.id, messageType, message)}
                onMouseEnter={() => onMessagePrefetch?.(message.id, messageType, message)}
                onPointerDown={() => onMessagePrefetch?.(message.id, messageType, message)}
                onContextMenu={() => onMessagePrefetch?.(message.id, messageType, message)}
                tabIndex={0}
                className={cn(
                  "py-2 px-3 rounded cursor-pointer text-sm group",
                  selectedMessageId === message.id
                    ? "bg-gray-200"
                    : "hover:bg-gray-100"
                )}
              >
                <div className="flex items-start gap-3">
                  <Mail className="w-4 h-4 text-primary/60 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{message.subject}</p>
                    <p className="mt-1 truncate text-left text-xs text-gray-500">
                      {message.from_address || message.to_address || ''}
                    </p>
                    <p className="mt-1 truncate text-left text-xs text-gray-500">
                      {new Date(message.received_at || message.sent_at || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="hidden shrink-0 items-center justify-center gap-1 self-center group-hover:flex" onClick={(e) => e.stopPropagation()}>
                    <ShareMessageDialog
                      emailId={email.id}
                      messageId={message.id}
                      messageSubject={message.subject}
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-black/10"
                        >
                          <Share2 className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:bg-black/10"
                      onClick={(e) => {
                        e.stopPropagation()
                        messageDeleteDialog.openWithTarget(message)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {loadingMore && (
              <div className="text-center text-sm text-gray-500 py-2">
                {t("loadingMore")}
              </div>
            )}
          </div>
        ) : (
          <div className={cn("flex flex-1 flex-col items-center justify-center px-6 text-center text-muted-foreground", emptyStateOffsetClass)}>
            <MailX className="mb-3 h-8 w-8 text-primary/40" />
            <p className="text-sm">{t("noMessages")}</p>
          </div>
        )}
      </div>
    </div>
    <AlertDialog open={messageDeleteDialog.open} onOpenChange={messageDeleteDialog.handleOpenChange}>
      <AlertDialogContent className="sm:max-w-[400px]">
        <AlertDialogHeader className="min-w-0">
          <AlertDialogTitle>{t("deleteConfirm")}</AlertDialogTitle>
          <AlertDialogDescription className="min-w-0 break-words [overflow-wrap:anywhere]">
            {t(isIcloudMail && messageType === "received" ? "icloudDeleteDescription" : "deleteDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-wrap">
          <AlertDialogCancel className="shrink-0">{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
              className="shrink-0 bg-destructive hover:bg-destructive/90"
              onClick={() => messageToDelete && handleDelete(messageToDelete)}
          >
            {tCommon("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  )
}
