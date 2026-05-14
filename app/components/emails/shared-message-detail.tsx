"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Loader2, MailOpen } from "lucide-react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { MessageDetailHeader } from "./message-detail-header"

interface MessageDetail {
  id: string
  from_address?: string
  to_address?: string
  subject: string
  content?: string
  html?: string
  received_at?: number
  sent_at?: number
  type?: "received" | "sent"
}

interface SharedMessageDetailProps {
  message: MessageDetail | null
  loading?: boolean
  t: {
    messageContent: string
    selectMessage: string
    loading: string
    from: string
    to: string
    subject: string
    time: string
    htmlFormat: string
    textFormat: string
  }
}

type ViewMode = "html" | "text"

const hasMessageBody = (message: MessageDetail | null) => {
  return typeof message?.content === "string" || typeof message?.html === "string"
}

export function SharedMessageDetail({
  message,
  loading = false,
  t,
}: SharedMessageDetailProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("html")
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // 如果没有HTML内容，默认显示文本
  useEffect(() => {
    if (message) {
      if (!message.html && message.content) {
        setViewMode("text")
      } else if (message.html) {
        setViewMode("html")
      }
    }
  }, [message])

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

        const updateHeight = () => {
          const container = iframe.parentElement
          if (container) {
            iframe.style.height = `${container.clientHeight}px`
          }
        }

        updateHeight()
        window.addEventListener("resize", updateHeight)

        const resizeObserver = new ResizeObserver(updateHeight)
        resizeObserver.observe(doc.body)

        doc.querySelectorAll("img").forEach((img: HTMLImageElement) => {
          img.onload = updateHeight
        })

        return () => {
          window.removeEventListener("resize", updateHeight)
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
        <p>{t.loading}</p>
      </div>
    )
  }

  if (!message) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
        <MailOpen className="mb-3 h-8 w-8 text-primary/40" />
        <p className="text-sm">{t.selectMessage}</p>
      </div>
    )
  }
  const isSentMessage = message.type === "sent"
  const bodyLoaded = hasMessageBody(message)

  return (
    <div className="h-full flex flex-col">
      <MessageDetailHeader
        subject={message.subject}
        fromLabel={t.from}
        toLabel={t.to}
        timeLabel={t.time}
        fromAddress={!isSentMessage ? message.from_address : undefined}
        toAddress={message.to_address}
        timestamp={message.sent_at || message.received_at || 0}
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
              <Label htmlFor="html" className="text-xs cursor-pointer">
                {t.htmlFormat}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="text" id="text" />
              <Label htmlFor="text" className="text-xs cursor-pointer">
                {t.textFormat}
              </Label>
            </div>
          </RadioGroup>
        </div>
      )}

      <div className="flex-1 overflow-auto relative">
        {loading && !bodyLoaded ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-gray-500">
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary/40" />
            <p>{t.loading}</p>
          </div>
        ) : viewMode === "html" && message.html ? (
          <iframe
            ref={iframeRef}
            className="absolute inset-0 w-full h-full border-0 bg-transparent"
            sandbox="allow-same-origin allow-popups"
          />
        ) : message.content ? (
          <div className="p-4 text-sm whitespace-pre-wrap">
            {message.content}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
            <MailOpen className="mb-3 h-8 w-8 text-primary/40" />
            <p className="text-sm">{t.selectMessage}</p>
          </div>
        )}
      </div>
    </div>
  )
}
