"use client"

import { useState, useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import { BrandHeader } from "@/components/ui/brand-header"
import { FloatingFontSwitcher } from "@/components/layout/floating-font-switcher"
import { SharedMessageList } from "@/components/emails/shared-message-list"
import { SharedMessageDetail } from "@/components/emails/shared-message-detail"
import { EMAIL_CONFIG } from "@/config"
import { formatUtcPlus8DateTime, isPermanentDate } from "@/lib/date-format"

interface Email {
  id: string
  address: string
  createdAt: Date
  expiresAt: Date
  shareExpiresAt?: Date
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

  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [selectedMessage, setSelectedMessage] = useState<MessageDetail | null>(null)
  const [messageLoading, setMessageLoading] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor)
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(initialTotal)
  const [refreshing, setRefreshing] = useState(false)
  const pollTimeoutRef = useRef<Timer | null>(null)
  const messagesRef = useRef<Message[]>(initialMessages)
  const messageDetailCacheRef = useRef<Map<string, MessageDetail>>(new Map())
  const messageDetailRequestRef = useRef<Map<string, Promise<MessageDetail>>>(new Map())
  const columnClass = "border border-gray-200 bg-background rounded-lg overflow-hidden"

  // 当 messages 改变时更新 ref
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const fetchMessages = async (cursor?: string) => {
    try {
      if (cursor) {
        setLoadingMore(true)
      }

      const url = new URL(`/api/shared/${token}/messages`, window.location.origin)
      if (cursor) {
        url.searchParams.set('cursor', cursor)
      }

      const messagesResponse = await fetch(url)
      if (messagesResponse.ok) {
        const messagesData = await messagesResponse.json() as {
          messages: Message[]
          nextCursor: string | null
          total: number
        }

        if (!cursor) {
          // 刷新时：合并新消息和旧消息，避免重复
          const newMessages = messagesData.messages
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
      setLoadingMore(false)
      setRefreshing(false)
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
    setRefreshing(true)
    await fetchMessages()
  }

  // 启动轮询
  useEffect(() => {
    startPolling()
    return () => {
      stopPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const handleLoadMore = () => {
    if (nextCursor && !loadingMore) {
      fetchMessages(nextCursor)
    }
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

  return (
    <div className="h-screen bg-gray-50">
      <div className="mx-auto flex h-full w-full max-w-[1720px] flex-col px-5 pb-5 pt-4">
        <BrandHeader
          title={email.address}
          brandHref={null}
          subtitle={(() => {
            const expiresAt = email.shareExpiresAt || email.expiresAt
            const formattedExpiresAt = formatUtcPlus8DateTime(expiresAt)

            if (!formattedExpiresAt) return ""

            return isPermanentDate(expiresAt)
              ? "永久有效"
              : `有效期至: ${formattedExpiresAt}`
          })()}
        />

        <div className="mt-4 grid min-h-0 flex-1 gap-5" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
          <div className={columnClass} style={{ gridColumn: "span 6 / span 6" }}>
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
              loading={false}
              loadingMore={loadingMore}
              refreshing={refreshing}
              hasMore={!!nextCursor}
              total={total}
              t={{
                received: t("messages.received"),
                noMessages: t("messages.noMessages"),
                messageCount: t("messages.messageCount"),
                loading: t("messageView.loading"),
                loadingMore: t("messages.loadingMore")
              }}
            />
          </div>

          <div className={columnClass} style={{ gridColumn: "span 18 / span 18" }}>
            <SharedMessageDetail
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
                subject: t("messages.subject"),
                time: t("messageView.time"),
                htmlFormat: t("messageView.htmlFormat"),
                textFormat: t("messageView.textFormat")
              }}
            />
          </div>
        </div>
      </div>

      <FloatingFontSwitcher />
    </div>
  )
}
