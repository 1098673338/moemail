"use client"

import { useCallback, useEffect, useRef } from "react"
import { Loader2, MailOpen } from "lucide-react"
import { MessageDetailHeader } from "./message-detail-header"
import { LinkifiedText } from "./linkified-text"
import { buildHtmlDocument } from "./html-message-document"

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
  emailAddress: string
  loading?: boolean
  t: {
    messageContent: string
    selectMessage: string
    loading: string
    from: string
    to: string
    subject: string
  }
}

const hasMessageBody = (message: MessageDetail | null) => {
  return typeof message?.content === "string" || typeof message?.html === "string"
}

export function SharedMessageDetail({
  message,
  emailAddress,
  loading = false,
  t,
}: SharedMessageDetailProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const updateIframeContent = useCallback(() => {
    if (message?.html && iframeRef.current) {
      const iframe = iframeRef.current
      const doc = iframe.contentDocument || iframe.contentWindow?.document

      if (doc) {
        doc.open()
        doc.write(buildHtmlDocument(message.html))
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
  }, [message?.html])

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
        fromAddress={message.from_address || (isSentMessage ? emailAddress : undefined)}
        toAddress={message.to_address || (!isSentMessage ? emailAddress : undefined)}
      />

      <div className="flex-1 overflow-auto relative">
        {loading && !bodyLoaded ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-gray-500">
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary/40" />
            <p>{t.loading}</p>
          </div>
        ) : message.html ? (
          <iframe
            ref={iframeRef}
            className="absolute inset-0 w-full h-full border-0 bg-transparent"
            sandbox="allow-same-origin allow-popups"
          />
        ) : message.content ? (
          <div className="p-4 text-sm whitespace-pre-wrap">
            <LinkifiedText text={message.content} />
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
