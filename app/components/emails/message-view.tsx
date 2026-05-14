"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Loader2, Share2 } from "lucide-react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { ShareMessageDialog } from "./share-message-dialog"
import { MessageDetailHeader } from "./message-detail-header"

interface Message {
  id: string
  from_address?: string
  to_address?: string
  subject: string
  content?: string
  html?: string
  received_at?: number
  sent_at?: number
  type?: 'received' | 'sent'
}

interface MessageViewProps {
  emailId: string
  messageId: string
  messageType?: 'received' | 'sent'
  initialMessage?: Message
  onClose: () => void
}

type ViewMode = "html" | "text"

const messageCache = new Map<string, Message>()
const messageRequestCache = new Map<string, Promise<Message>>()

const getMessageCacheKey = (
  emailId: string,
  messageId: string,
  messageType: 'received' | 'sent' = 'received'
) => `${emailId}:${messageType}:${messageId}`

const hasMessageBody = (message: Message | null) => {
  return typeof message?.content === "string" || typeof message?.html === "string"
}

export async function prefetchMessage(
  emailId: string,
  messageId: string,
  messageType: 'received' | 'sent' = 'received'
) {
  const cacheKey = getMessageCacheKey(emailId, messageId, messageType)
  const cachedMessage = messageCache.get(cacheKey)

  if (cachedMessage) return cachedMessage

  const existingRequest = messageRequestCache.get(cacheKey)
  if (existingRequest) return existingRequest

  const request = fetch(`/api/emails/${emailId}/${messageId}${messageType === 'sent' ? '?type=sent' : ''}`)
    .then(async (response) => {
      if (!response.ok) {
        const errorData = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(errorData?.error || "Failed to load message")
      }

      const data = await response.json() as { message: Message }
      messageCache.set(cacheKey, data.message)
      return data.message
    })
    .finally(() => {
      messageRequestCache.delete(cacheKey)
    })

  messageRequestCache.set(cacheKey, request)
  return request
}

export function MessageView({ emailId, messageId, messageType = 'received', initialMessage }: MessageViewProps) {
  const t = useTranslations("emails.messageView")
  const cacheKey = getMessageCacheKey(emailId, messageId, messageType)
  const cachedInitialMessage = messageCache.get(cacheKey)
  const firstMessage = cachedInitialMessage ?? initialMessage ?? null
  const [message, setMessage] = useState<Message | null>(firstMessage)
  const [loading, setLoading] = useState(!hasMessageBody(firstMessage))
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(firstMessage?.html ? "html" : "text")
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    const cacheKey = getMessageCacheKey(emailId, messageId, messageType)
    const cachedMessage = messageCache.get(cacheKey)
    const nextInitialMessage = cachedMessage ?? initialMessage ?? null
    let cancelled = false

    setError(null)
    setMessage(nextInitialMessage)
    setViewMode(nextInitialMessage?.html ? "html" : "text")

    if (hasMessageBody(nextInitialMessage)) {
      setLoading(false)
      return
    }

    const fetchMessage = async () => {
      try {
        setLoading(true)

        const data = await prefetchMessage(emailId, messageId, messageType)
        if (cancelled) return

        setMessage(data)
        setViewMode(data.html ? "html" : "text")
      } catch (error) {
        if (cancelled) return

        const errorMessage = error instanceof TypeError
          ? t("networkError")
          : error instanceof Error && error.message !== "Failed to load message"
            ? error.message
            : t("loadError")
        setError(errorMessage)

        if (!nextInitialMessage) {
          toast({
            title: errorMessage,
            variant: "destructive"
          })
        }
        console.error("Failed to fetch message:", error)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchMessage()

    return () => {
      cancelled = true
    }
  }, [emailId, initialMessage, messageId, messageType, toast, t])

  const updateIframeContent = useCallback(() => {
    if (viewMode === "html" && message?.html && iframeRef.current) {
      const iframe = iframeRef.current
      const doc = iframe.contentDocument || iframe.contentWindow?.document

      if (doc) {
        doc.open()
        doc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <base target="_blank">
              <style>
                html, body {
                  margin: 0;
                  padding: 0;
                  min-height: 100%;
                  font-family: system-ui, -apple-system, sans-serif;
                  color: #000;
                  background: #fff;
                }
                body {
                  padding: 20px;
                }
                img {
                  max-width: 100%;
                  height: auto;
                }
                a {
                  color: #2563eb;
                }
                * {
                  -ms-overflow-style: none;
                  scrollbar-width: none;
                }
                *::-webkit-scrollbar {
                  display: none;
                  width: 0;
                  height: 0;
                }
              </style>
            </head>
            <body>${message.html}</body>
          </html>
        `)
        doc.close()

        // 更新高度以填充容器
        const updateHeight = () => {
          const container = iframe.parentElement
          if (container) {
            iframe.style.height = `${container.clientHeight}px`
          }
        }

        updateHeight()
        window.addEventListener('resize', updateHeight)

        // 监听内容变化
        const resizeObserver = new ResizeObserver(updateHeight)
        resizeObserver.observe(doc.body)

        // 监听图片加载
        doc.querySelectorAll('img').forEach((img: HTMLImageElement) => {
          img.onload = updateHeight
        })

        return () => {
          window.removeEventListener('resize', updateHeight)
          resizeObserver.disconnect()
        }
      }
    }
  }, [message?.html, viewMode])

  useEffect(() => {
    return updateIframeContent()
  }, [updateIframeContent])

  if (loading && !message) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-gray-500">
        <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary/40" />
        <p>{t("loading")}</p>
      </div>
    )
  }

  if (error && !message) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-center">
        <p className="text-sm text-destructive mb-2">{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="text-xs text-primary hover:underline"
        >
          {t("retry")}
        </button>
      </div>
    )
  }

  if (!message) return null
  const isSentMessage = messageType === 'sent' || message.type === 'sent'
  const bodyLoaded = hasMessageBody(message)

  return (
    <div className="h-full flex flex-col">
      <MessageDetailHeader
        subject={message.subject}
        fromLabel={t("from")}
        toLabel={t("to")}
        timeLabel={t("time")}
        fromAddress={!isSentMessage ? message.from_address : undefined}
        toAddress={message.to_address}
        timestamp={message.sent_at || message.received_at || 0}
        action={
          <ShareMessageDialog
            emailId={emailId}
            messageId={message.id}
            messageSubject={message.subject}
            trigger={
              <button className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-primary/10">
                <Share2 className="h-4 w-4 text-gray-500" />
              </button>
            }
          />
        }
      />
      
      {message.html && message.content && (
        <div className="border-b border-gray-200 p-2">
          <RadioGroup
            value={viewMode}
            onValueChange={(value) => setViewMode(value as ViewMode)}
            className="flex items-center gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="html" id="html" />
              <Label 
                htmlFor="html" 
                className="text-xs cursor-pointer"
              >
                {t("htmlFormat")}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="text" id="text" />
              <Label 
                htmlFor="text" 
                className="text-xs cursor-pointer"
              >
                {t("textFormat")}
              </Label>
            </div>
          </RadioGroup>
        </div>
      )}
      
      <div className="flex-1 overflow-auto relative">
        {loading && !bodyLoaded ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-gray-500">
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary/40" />
            <p>{t("loading")}</p>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="mb-2 text-sm text-destructive">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-xs text-primary hover:underline"
            >
              {t("retry")}
            </button>
          </div>
        ) : viewMode === "html" && message.html ? (
          <iframe
            ref={iframeRef}
            className="absolute inset-0 w-full h-full border-0 bg-transparent"
            sandbox="allow-same-origin allow-popups"
          />
        ) : (
          <div className="p-4 text-sm whitespace-pre-wrap">
            {message.content}
          </div>
        )}
      </div>
    </div>
  )
} 
