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
  onMessagePrefetch?: (messageId: string, messageType: MessageType, message: Message) => void
  selectedMessageId?: string | null
  refreshTrigger?: number
  emptyStateOffsetClass?: string
  onTotalChange?: (messageType: MessageType, total: number) => void
  tabControls?: ReactNode
}

interface MessageResponse {
  messages: Message[]
  nextCursor: string | null
  total: number
}

type MessageType = 'received' | 'sent'
const PREFETCH_MESSAGE_COUNT = 5

export function MessageList({ email, messageType, onMessageSelect, onMessagePrefetch, selectedMessageId, refreshTrigger, emptyStateOffsetClass, onTotalChange, tabControls }: MessageListProps) {
  const t = useTranslations("emails.messages")
  const tCommon = useTranslations("common.actions")
  const tFeedback = useTranslations("common.feedback")
  const isCustomEmail = Boolean(email.isCustom)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(!isCustomEmail)
  const [refreshing, setRefreshing] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const pollTimeoutRef = useRef<Timer>(null)
  const messagesRef = useRef<Message[]>([]) // 添加 ref 来追踪最新的消息列表
  const [total, setTotal] = useState(0)
  const messageDeleteDialog = useDeferredDialogTarget<Message>()
  const messageToDelete = messageDeleteDialog.target
  const { toast } = useToast()

  const updateTotal = (nextTotal: number) => {
    setTotal(nextTotal)
    onTotalChange?.(messageType, nextTotal)
  }

  // 当 messages 改变时更新 ref
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    if (isCustomEmail || !onMessagePrefetch || messages.length === 0) return

    messages.slice(0, PREFETCH_MESSAGE_COUNT).forEach(message => {
      onMessagePrefetch(message.id, messageType, message)
    })
  }, [isCustomEmail, messageType, messages, onMessagePrefetch])

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

    try {
      const url = new URL(`/api/emails/${email.id}`, window.location.origin)
      if (messageType === 'sent') {
        url.searchParams.set('type', 'sent')
      }
      url.searchParams.set('summary', '1')
      if (cursor) {
        url.searchParams.set('cursor', cursor)
      }
      const response = await fetch(url)
      const data = await response.json() as MessageResponse
      
      if (!cursor) {
        const newMessages = data.messages
        if (replace) {
          setMessages(newMessages)
          setNextCursor(data.nextCursor)
          updateTotal(data.total)
          return
        }

        const oldMessages = messagesRef.current

        const lastDuplicateIndex = newMessages.findIndex(
          newMsg => oldMessages.some(oldMsg => oldMsg.id === newMsg.id)
        )

        if (lastDuplicateIndex === -1) {
          setMessages(newMessages)
          setNextCursor(data.nextCursor)
          updateTotal(data.total)
          return
        }
        const uniqueNewMessages = newMessages.slice(0, lastDuplicateIndex)
        setMessages([...uniqueNewMessages, ...oldMessages])
        updateTotal(data.total)
        return
      }
      setMessages(prev => [...prev, ...data.messages])
      setNextCursor(data.nextCursor)
      updateTotal(data.total)
    } catch (error) {
      console.error("Failed to fetch messages:", error)
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
  }

  const startPolling = () => {
    stopPolling()
    pollTimeoutRef.current = setInterval(() => {
      if (!refreshing && !loadingMore) {
        fetchMessages()
      }
    }, EMAIL_CONFIG.POLL_INTERVAL)
  }

  const stopPolling = () => {
    if (pollTimeoutRef.current) {
      clearInterval(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }

  const handleRefresh = async () => {
    if (isCustomEmail) {
      setMessages([])
      setNextCursor(null)
      updateTotal(0)
      setRefreshing(false)
      return
    }

    setRefreshing(true)
    await fetchMessages(undefined, true)
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
    try {
      const response = await fetch(`/api/emails/${email.id}/${message.id}${messageType === 'sent' ? '?type=sent' : ''}`, {
        method: "DELETE"
      })

      if (!response.ok) {
        const data = await response.json()
        toast({
          title: (data as { error?: string }).error || tFeedback("deleteFailed"),
          variant: "destructive"
        })
        return
      }

      setMessages(prev => prev.filter(e => e.id !== message.id))
      setTotal(prev => {
        const nextTotal = Math.max(prev - 1, 0)
        onTotalChange?.(messageType, nextTotal)
        return nextTotal
      })

      toast({
        title: tFeedback("deleteSuccess")
      })

      if (selectedMessageId === message.id) {
        onMessageSelect(null)
      }
    } catch {
      toast({
        title: tFeedback("deleteFailed"),
        variant: "destructive"
      })
    } finally {
      messageDeleteDialog.close()
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
    setLoading(true)
    setNextCursor(null)
    fetchMessages(undefined, true)
    startPolling() 

    return () => {
      stopPolling() 
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email.id, isCustomEmail])

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
            disabled={refreshing}
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
            {t("deleteDescription")}
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
