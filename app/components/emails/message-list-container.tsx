"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Tabs, SlidingTabsList, SlidingTabsTrigger, TabsContent } from "@/components/ui/tabs"
import { MessageList } from "./message-list"
import { useSendPermission } from "@/hooks/use-send-permission"

interface MessageListContainerProps {
  email: {
    id: string
    address: string
  }
  onMessageSelect: (messageId: string | null, messageType?: MessageType, message?: MessageSummary) => void
  onMessagePrefetch?: (messageId: string, messageType: MessageType, message: MessageSummary) => void
  selectedMessageId?: string | null
  refreshTrigger?: number
}

type MessageType = 'received' | 'sent'

interface MessageSummary {
  id: string
  from_address?: string
  to_address?: string
  subject: string
  received_at?: number
  sent_at?: number
  content?: string
  html?: string
}

export function MessageListContainer({ email, onMessageSelect, onMessagePrefetch, selectedMessageId, refreshTrigger }: MessageListContainerProps) {
  const t = useTranslations("emails.messages")
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received')
  const [messageCounts, setMessageCounts] = useState<Record<'received' | 'sent', number>>({
    received: 0,
    sent: 0,
  })
  const { canSend: canSendEmails } = useSendPermission()

  useEffect(() => {
    if (!email.id || !canSendEmails) return

    let cancelled = false

    const fetchCount = async (messageType: 'received' | 'sent') => {
      const url = new URL(`/api/emails/${email.id}`, window.location.origin)
      url.searchParams.set('countOnly', '1')
      if (messageType === 'sent') {
        url.searchParams.set('type', 'sent')
      }

      const response = await fetch(url)
      if (!response.ok) return 0

      const data = await response.json() as { total?: number }
      return Number.isFinite(data.total) ? data.total! : 0
    }

    const fetchInactiveCount = async () => {
      try {
        const inactiveTab = activeTab === 'received' ? 'sent' : 'received'
        const total = await fetchCount(inactiveTab)

        if (!cancelled) {
          setMessageCounts(prev => ({
            ...prev,
            [inactiveTab]: total,
          }))
        }
      } catch (error) {
        console.error("Failed to fetch message counts:", error)
      }
    }

    fetchInactiveCount()

    return () => {
      cancelled = true
    }
  }, [email.id, canSendEmails, activeTab, refreshTrigger])

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId as 'received' | 'sent')
    onMessageSelect(null)
  }

  const handleTotalChange = (messageType: 'received' | 'sent', total: number) => {
    setMessageCounts(prev => ({
      ...prev,
      [messageType]: total,
    }))
  }

  const tabControls = (
    <SlidingTabsList className="h-8 w-fit min-w-48 max-w-full shrink-0">
      <SlidingTabsTrigger value="received" className="h-6 min-w-max gap-1 px-2 py-0.5 text-xs">
        <span className="whitespace-nowrap">{t("received")}</span>
        <span className="whitespace-nowrap tabular-nums opacity-60">{messageCounts.received}</span>
      </SlidingTabsTrigger>
      <SlidingTabsTrigger value="sent" className="h-6 min-w-max gap-1 px-2 py-0.5 text-xs">
        <span className="whitespace-nowrap">{t("sent")}</span>
        <span className="whitespace-nowrap tabular-nums opacity-60">{messageCounts.sent}</span>
      </SlidingTabsTrigger>
    </SlidingTabsList>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      {canSendEmails ? (
        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex h-full min-h-0 flex-col">
          <TabsContent value="received" className="m-0 min-h-0 flex-1 overflow-hidden">
            <MessageList
              email={email}
              messageType="received"
              onMessageSelect={onMessageSelect}
              onMessagePrefetch={onMessagePrefetch}
              selectedMessageId={selectedMessageId}
              refreshTrigger={refreshTrigger}
              emptyStateOffsetClass="-translate-y-12"
              onTotalChange={handleTotalChange}
              tabControls={tabControls}
            />
          </TabsContent>
          
          <TabsContent value="sent" className="m-0 min-h-0 flex-1 overflow-hidden">
            <MessageList
              email={email}
              messageType="sent"
              onMessageSelect={onMessageSelect}
              onMessagePrefetch={onMessagePrefetch}
              selectedMessageId={selectedMessageId}
              refreshTrigger={refreshTrigger}
              emptyStateOffsetClass="-translate-y-12"
              onTotalChange={handleTotalChange}
              tabControls={tabControls}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          <MessageList
            email={email}
            messageType="received"
            onMessageSelect={onMessageSelect}
            onMessagePrefetch={onMessagePrefetch}
            selectedMessageId={selectedMessageId}
            refreshTrigger={refreshTrigger}
            emptyStateOffsetClass="-translate-y-12"
          />
        </div>
      )}
    </div>
  )
} 
