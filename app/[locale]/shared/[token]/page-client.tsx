"use client"

import { useState, useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import { SharedMessageList } from "@/components/emails/shared-message-list"
import { SharedMessageDetail } from "@/components/emails/shared-message-detail"
import { useCopy } from "@/hooks/use-copy"
import { EMAIL_CONFIG } from "@/config"
import { formatUtcPlus8DateTimeToMinute, isPermanentDate } from "@/lib/date-format"
import { Copy } from "lucide-react"
import { SlidingTabsList, SlidingTabsTrigger, Tabs } from "@/components/ui/tabs"

interface Email {
  id: string
  address: string
  createdAt: Date
  expiresAt: Date
  shareExpiresAt?: Date
  isIcloudMail?: boolean
}

interface Message {
  id: string
  from_address?: string
  to_address?: string
  subject: string
  received_at?: Date | number
  sent_at?: Date | number
  type?: "received" | "sent"
}

interface MessageDetail extends Message {
  content?: string
  html?: string
}

type MessageType = "received" | "sent"

interface SharedEmailPageClientProps {
  email: Email
  initialMessages: Message[]
  initialNextCursor: string | null
  initialTotal: number
  token: string
}

export function SharedEmailPageClient({
  email,
  initialMessages,
  initialNextCursor,
  initialTotal,
  token
}: SharedEmailPageClientProps) {
  const t = useTranslations("emails")
  const tCommon = useTranslations("common.actions")
  const { copyToClipboard } = useCopy()

  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [activeType, setActiveType] = useState<MessageType>("received")
  const [messageCounts, setMessageCounts] = useState<Record<MessageType, number>>({
    received: initialTotal,
    sent: 0,
  })
  const [selectedMessage, setSelectedMessage] = useState<MessageDetail | null>(null)
  const [messageLoading, setMessageLoading] = useState(false)
  const [listLoading, setListLoading] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor)
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(initialTotal)
  const [refreshing, setRefreshing] = useState(false)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesRef = useRef<Message[]>(initialMessages)
  const activeTypeRef = useRef<MessageType>("received")
  const refreshingRef = useRef(false)
  const loadingMoreRef = useRef(false)
  const autoRefreshInFlightRef = useRef(false)
  const autoRefreshStartedAtRef = useRef(Date.now())
  const listRequestIdRef = useRef(0)
  const messageDetailCacheRef = useRef<Map<string, MessageDetail>>(new Map())
  const messageDetailRequestRef = useRef<Map<string, Promise<MessageDetail>>>(new Map())
  const columnClass = "min-h-0 border border-gray-200 bg-background rounded-lg overflow-hidden flex flex-col"
  const expiresAt = email.shareExpiresAt || email.expiresAt
  const formattedExpiresAt = formatUtcPlus8DateTimeToMinute(expiresAt)
  const compactExpiresAt = formattedExpiresAt.slice(5)
  const expiresAtLabel = formattedExpiresAt
    ? isPermanentDate(expiresAt)
      ? "永久有效"
      : `${compactExpiresAt} 过期`
    : ""
  const isIcloudMail = Boolean(email.isIcloudMail)
  const autoRefreshInterval = isIcloudMail
    ? EMAIL_CONFIG.ICLOUD_SYNC_INTERVAL
    : EMAIL_CONFIG.POLL_INTERVAL
  const autoRefreshDuration = isIcloudMail
    ? EMAIL_CONFIG.ICLOUD_AUTO_REFRESH_DURATION
    : undefined

  // 当 messages 改变时更新 ref
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    refreshingRef.current = refreshing
  }, [refreshing])

  useEffect(() => {
    loadingMoreRef.current = loadingMore
  }, [loadingMore])

  const fetchMessages = async (cursor?: string, options?: {
    type?: MessageType
    sync?: boolean
    rescan?: boolean
    recentLimit?: number
    replace?: boolean
  }) => {
    const requestType = options?.type ?? activeTypeRef.current
    const requestId = ++listRequestIdRef.current

    try {
      if (cursor) {
        loadingMoreRef.current = true
        setLoadingMore(true)
      }

      const url = new URL(`/api/shared/${token}/messages`, window.location.origin)
      if (requestType === "sent") {
        url.searchParams.set("type", "sent")
      }
      if (cursor) {
        url.searchParams.set('cursor', cursor)
      }
      if (options?.sync && !cursor) {
        url.searchParams.set('sync', '1')
      }
      if (options?.rescan && !cursor) {
        url.searchParams.set('rescan', '1')
      }
      if (options?.recentLimit && !cursor) {
        url.searchParams.set('recentLimit', String(options.recentLimit))
      }
      url.searchParams.set('_', String(Date.now()))

      const messagesResponse = await fetch(url, {
        cache: 'no-store',
      })
      if (messagesResponse.ok) {
        const messagesData = await messagesResponse.json() as {
          messages: Message[]
          nextCursor: string | null
          total: number
        }

        if (requestId !== listRequestIdRef.current || activeTypeRef.current !== requestType) {
          return
        }

        setMessageCounts(prev => ({
          ...prev,
          [requestType]: messagesData.total,
        }))

        if (!cursor) {
          // 刷新时：合并新消息和旧消息，避免重复
          const newMessages = messagesData.messages

          if (options?.replace) {
            setMessages(newMessages)
            setNextCursor(messagesData.nextCursor)
            setTotal(messagesData.total)
            return
          }

          const oldMessages = messagesRef.current

          // 找到第一个重复的消息
          const lastDuplicateIndex = newMessages.findIndex(
            newMsg => oldMessages.some(oldMsg => oldMsg.id === newMsg.id)
          )

          if (lastDuplicateIndex === -1) {
            // 没有重复，直接使用新消息
            setMessages(newMessages)
            setNextCursor(messagesData.nextCursor)
            setTotal(messagesData.total)
            return
          }
          // 有重复，只添加新的消息
          const uniqueNewMessages = newMessages.slice(0, lastDuplicateIndex)
          setMessages([...uniqueNewMessages, ...oldMessages])
          setNextCursor(messagesData.nextCursor)
          setTotal(messagesData.total)
          return
        }
        // 加载更多：追加到列表末尾
        setMessages(prev => [...prev, ...(messagesData.messages || [])])
        setNextCursor(messagesData.nextCursor)
        setTotal(messagesData.total)
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err)
    } finally {
      if (requestId === listRequestIdRef.current) {
        loadingMoreRef.current = false
        refreshingRef.current = false
        setLoadingMore(false)
        setRefreshing(false)
        setListLoading(false)
      }
    }
  }

  useEffect(() => {
    let cancelled = false
    const inactiveType: MessageType = activeType === "received" ? "sent" : "received"
    const url = new URL(`/api/shared/${token}/messages`, window.location.origin)
    url.searchParams.set("countOnly", "1")
    if (inactiveType === "sent") {
      url.searchParams.set("type", "sent")
    }

    fetch(url, { cache: "no-store" })
      .then(async response => {
        if (!response.ok) return null
        return response.json() as Promise<{ total?: number }>
      })
      .then(data => {
        if (cancelled || !data || !Number.isFinite(data.total)) return
        setMessageCounts(prev => ({
          ...prev,
          [inactiveType]: data.total!,
        }))
      })
      .catch(error => {
        console.error("Failed to fetch shared message count:", error)
      })

    return () => {
      cancelled = true
    }
  }, [activeType, token])

  const stopPolling = () => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }

  const resetAutoRefreshWindow = () => {
    autoRefreshStartedAtRef.current = Date.now()
  }

  const getAutoRefreshRemainingTime = () => {
    if (!autoRefreshDuration) return Infinity
    return autoRefreshDuration - (Date.now() - autoRefreshStartedAtRef.current)
  }

  const isAutoRefreshWindowActive = () => getAutoRefreshRemainingTime() > 0

  const runAutoRefresh = async () => {
    if (autoRefreshInFlightRef.current || !isAutoRefreshWindowActive()) return

    autoRefreshInFlightRef.current = true

    try {
      await fetchMessages(undefined, {
        type: activeTypeRef.current,
        sync: activeTypeRef.current === "received" && isIcloudMail,
        recentLimit: isIcloudMail ? EMAIL_CONFIG.ICLOUD_AUTO_SYNC_LIMIT : undefined,
      })
    } finally {
      autoRefreshInFlightRef.current = false
    }
  }

  const scheduleNextAutoRefresh = (tick: () => void) => {
    if (!isAutoRefreshWindowActive()) return

    pollTimeoutRef.current = setTimeout(
      tick,
      Math.min(autoRefreshInterval, Math.max(getAutoRefreshRemainingTime(), 0))
    )
  }

  const startPolling = () => {
    stopPolling()
    if (!isAutoRefreshWindowActive()) return

    const tick = () => {
      pollTimeoutRef.current = null

      if (!isAutoRefreshWindowActive()) return

      if (!refreshingRef.current && !loadingMoreRef.current && !autoRefreshInFlightRef.current) {
        void runAutoRefresh().finally(() => {
          scheduleNextAutoRefresh(tick)
        })
        return
      }

      pollTimeoutRef.current = setTimeout(
        tick,
        Math.min(autoRefreshInterval, 1_000, Math.max(getAutoRefreshRemainingTime(), 0))
      )
    }

    scheduleNextAutoRefresh(tick)
  }

  const handleRefresh = async () => {
    if (refreshingRef.current || loadingMoreRef.current) return

    refreshingRef.current = true
    stopPolling()
    resetAutoRefreshWindow()
    setRefreshing(true)
    try {
      await fetchMessages(undefined, {
        type: activeTypeRef.current,
        sync: activeTypeRef.current === "received" && isIcloudMail,
        rescan: activeTypeRef.current === "received" && isIcloudMail,
        replace: true,
      })
    } finally {
      startPolling()
    }
  }

  // 启动轮询
  useEffect(() => {
    resetAutoRefreshWindow()
    if (isIcloudMail && activeType === "received") {
      void runAutoRefresh()
    }
    startPolling()
    return () => {
      stopPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isIcloudMail, autoRefreshInterval, autoRefreshDuration, activeType])

  const handleLoadMore = () => {
    if (nextCursor && !loadingMore) {
      fetchMessages(nextCursor, { type: activeTypeRef.current })
    }
  }

  const handleTypeChange = (value: string) => {
    const nextType = value as MessageType
    if (nextType === activeTypeRef.current) return

    listRequestIdRef.current += 1
    activeTypeRef.current = nextType
    messagesRef.current = []
    setActiveType(nextType)
    setMessages([])
    setNextCursor(null)
    setTotal(messageCounts[nextType])
    setSelectedMessage(null)
    setMessageLoading(false)
    setListLoading(true)
    void fetchMessages(undefined, {
      type: nextType,
      replace: true,
    })
  }

  const fetchMessageDetailData = (messageId: string) => {
    const cachedMessage = messageDetailCacheRef.current.get(messageId)
    if (cachedMessage) return Promise.resolve(cachedMessage)

    const existingRequest = messageDetailRequestRef.current.get(messageId)
    if (existingRequest) return existingRequest

    const request = fetch(`/api/shared/${token}/messages/${messageId}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load message")
        }

        const data = await response.json() as { message: MessageDetail }
        messageDetailCacheRef.current.set(messageId, data.message)
        return data.message
      })
      .finally(() => {
        messageDetailRequestRef.current.delete(messageId)
      })

    messageDetailRequestRef.current.set(messageId, request)
    return request
  }

  const prefetchMessageDetail = (message: Message) => {
    fetchMessageDetailData(message.id).catch(() => {
      // 预取失败不打断当前页面，点击详情时会再处理。
    })
  }

  const fetchMessageDetail = async (message: Message) => {
    if (
      selectedMessage?.id === message.id &&
      (typeof selectedMessage.content === "string" || typeof selectedMessage.html === "string")
    ) {
      return
    }

    const cachedMessage = messageDetailCacheRef.current.get(message.id)
    if (cachedMessage) {
      setSelectedMessage(cachedMessage)
      setMessageLoading(false)
      return
    }

    try {
      setSelectedMessage(message)
      setMessageLoading(true)

      const data = await fetchMessageDetailData(message.id)
      setSelectedMessage(data)
    } catch (err) {
      console.error("Failed to fetch message:", err)
    } finally {
      setMessageLoading(false)
    }
  }

  const tabControls = (
    <SlidingTabsList className="h-8 w-fit min-w-48 max-w-full shrink-0">
      <SlidingTabsTrigger value="received" className="h-6 min-w-max gap-1 px-2 py-0.5 text-xs">
        <span className="whitespace-nowrap">{t("messages.received")}</span>
        <span className="whitespace-nowrap tabular-nums opacity-60">{messageCounts.received}</span>
      </SlidingTabsTrigger>
      <SlidingTabsTrigger value="sent" className="h-6 min-w-max gap-1 px-2 py-0.5 text-xs">
        <span className="whitespace-nowrap">{t("messages.sent")}</span>
        <span className="whitespace-nowrap tabular-nums opacity-60">{messageCounts.sent}</span>
      </SlidingTabsTrigger>
    </SlidingTabsList>
  )

  return (
    <div className="h-screen bg-gray-50">
      <div className="flex h-full w-full flex-col p-5">
        <div className="grid min-h-0 flex-1 gap-5" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
          <div className={columnClass} style={{ gridColumn: "span 6 / span 6" }}>
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 pl-2 pr-3">
              <h2 className="w-full min-w-0 overflow-hidden pl-2 text-sm font-bold">
                <div className="flex w-full items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate">{email.address}</span>
                    <button
                      type="button"
                      aria-label={tCommon("copy")}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
                      onClick={() => copyToClipboard(email.address)}
                    >
                      <Copy className="size-4" />
                    </button>
                  </div>
                  {expiresAtLabel && (
                    <span className="shrink-0 whitespace-nowrap text-xs font-normal text-gray-500 tabular-nums">
                      {expiresAtLabel}
                    </span>
                  )}
                </div>
              </h2>
            </div>
            <div className="min-h-0 flex-1">
              <Tabs value={activeType} onValueChange={handleTypeChange} className="h-full">
                <SharedMessageList
                  messages={messages.map(msg => ({
                    ...msg,
                    received_at: (() => {
                      if (!msg.received_at) return undefined
                      try {
                        const date = new Date(msg.received_at)
                        return isNaN(date.getTime()) ? undefined : date.getTime()
                      } catch {
                        return undefined
                      }
                    })(),
                    sent_at: (() => {
                      if (!msg.sent_at) return undefined
                      try {
                        const date = new Date(msg.sent_at)
                        return isNaN(date.getTime()) ? undefined : date.getTime()
                      } catch {
                        return undefined
                      }
                    })()
                  }))}
                  selectedMessageId={selectedMessage?.id}
                  onMessageSelect={fetchMessageDetail}
                  onMessagePrefetch={prefetchMessageDetail}
                  onLoadMore={handleLoadMore}
                  onRefresh={handleRefresh}
                  loading={listLoading}
                  loadingMore={loadingMore}
                  refreshing={refreshing}
                  hasMore={!!nextCursor}
                  total={total}
                  tabControls={tabControls}
                  emptyStateOffsetClass="-translate-y-12"
                  t={{
                    noMessages: t("messages.noMessages"),
                    messageCount: t("messages.messageCount"),
                    loading: t("messageView.loading"),
                    loadingMore: t("messages.loadingMore")
                  }}
                />
              </Tabs>
            </div>
          </div>

          <div className={columnClass} style={{ gridColumn: "span 18 / span 18" }}>
            <SharedMessageDetail
              emailAddress={email.address}
              message={selectedMessage ? {
                ...selectedMessage,
                received_at: (() => {
                  if (!selectedMessage.received_at) return undefined
                  try {
                    const date = new Date(selectedMessage.received_at)
                    return isNaN(date.getTime()) ? undefined : date.getTime()
                  } catch {
                    return undefined
                  }
                })(),
                sent_at: (() => {
                  if (!selectedMessage.sent_at) return undefined
                  try {
                    const date = new Date(selectedMessage.sent_at)
                    return isNaN(date.getTime()) ? undefined : date.getTime()
                  } catch {
                    return undefined
                  }
                })()
              } : null}
              loading={messageLoading}
              t={{
                messageContent: t("layout.messageContent"),
                selectMessage: t("layout.selectMessage"),
                loading: t("messageView.loading"),
                from: t("messageView.from"),
                to: t("messageView.to"),
                subject: t("messages.subject")
              }}
            />
          </div>
        </div>
      </div>

    </div>
  )
}
