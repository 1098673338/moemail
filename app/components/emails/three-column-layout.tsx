"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { EmailList } from "./email-list"
import { MessageListContainer } from "./message-list-container"
import { MessageView, prefetchMessage } from "./message-view"
import { CreateDialog } from "./create-dialog"
import { SendDialog } from "./send-dialog"
import { useCopy } from "@/hooks/use-copy"
import { useSendPermission } from "@/hooks/use-send-permission"
import { Copy, Inbox, MailOpen } from "lucide-react"

interface Email {
  id: string
  address: string
  isCustom?: boolean
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

export function ThreeColumnLayout() {
  const t = useTranslations("emails.layout")
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [selectedMessageType, setSelectedMessageType] = useState<MessageType>('received')
  const [selectedMessagePreview, setSelectedMessagePreview] = useState<MessageSummary | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [selectedGroupName, setSelectedGroupName] = useState<string | undefined>()
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [emailRefreshTrigger, setEmailRefreshTrigger] = useState(0)
  const { copyToClipboard } = useCopy()
  const { canSend: canSendEmails, loading: sendPermissionLoading } = useSendPermission()

  const columnClass = "min-h-0 border border-gray-200 bg-background rounded-lg overflow-hidden flex flex-col"
  const headerClass = "h-12 px-2 border-b border-gray-200 flex items-center justify-between shrink-0"
  const titleClass = "text-sm font-bold px-2 w-full overflow-hidden"
  const actionTitleClass = "text-sm font-bold pl-2 pr-0 w-full min-w-0 overflow-hidden"
  const emailColumnStyle = { gridColumn: "span 4 / span 4" }
  const messageListColumnStyle = { gridColumn: "span 6 / span 6" }
  const contentColumnStyle = { gridColumn: "span 14 / span 14" }
  const showMessageList = Boolean(selectedEmail && !selectedEmail.isCustom)

  const copyEmailAddress = () => {
    copyToClipboard(selectedEmail?.address || "")
  }

  const handleMessageSelect = (messageId: string | null, messageType: MessageType = 'received', message?: MessageSummary) => {
    setSelectedMessageId(messageId)
    setSelectedMessageType(messageType)
    setSelectedMessagePreview(message ?? null)
  }

  const handleMessagePrefetch = (messageId: string, messageType: MessageType, message?: MessageSummary) => {
    if (!selectedEmail) return
    prefetchMessage(selectedEmail.id, messageId, messageType, message).catch(() => {
      // Prefetch is a best-effort speedup; the detail view still handles errors.
    })
  }

  const handleSendSuccess = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  const handleEmailCreated = () => {
    setEmailRefreshTrigger(prev => prev + 1)
  }

  const handleEmailListRefresh = () => {
    if (selectedEmail) {
      setRefreshTrigger(prev => prev + 1)
    }
  }

  const handleGroupChange = (groupId: string | null, groupName?: string) => {
    setSelectedGroupId(groupId)
    setSelectedGroupName(groupName)
  }

  return (
    <div className="flex h-full min-h-0 flex-col pb-5 pt-16">
      <div className="grid min-h-0 flex-1 gap-5" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
        <div className={columnClass} style={emailColumnStyle}>
          <div className={headerClass}>
            <h2 className={actionTitleClass}>
              <div className="flex w-full items-center justify-between gap-2">
                <span className="min-w-0 truncate">{t("myEmails")}</span>
                <CreateDialog
                  onEmailCreated={handleEmailCreated}
                  selectedGroupId={selectedGroupId}
                  selectedGroupName={selectedGroupName}
                />
              </div>
            </h2>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <EmailList
              onEmailSelect={(email) => {
                setSelectedEmail(email)
                setSelectedMessageId(null)
                setSelectedMessagePreview(null)
              }}
              selectedEmailId={selectedEmail?.id}
              onGroupChange={handleGroupChange}
              refreshTrigger={emailRefreshTrigger}
              onRefresh={handleEmailListRefresh}
            />
          </div>
        </div>

        <div className={columnClass} style={messageListColumnStyle}>
          <div className={headerClass}>
            <h2 className={showMessageList ? actionTitleClass : titleClass}>
              {showMessageList && selectedEmail ? (
                <div className="w-full flex justify-between items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className="truncate min-w-0">{selectedEmail.address}</span>
                    <div
                      className="shrink-0 h-8 w-8 cursor-pointer rounded-md flex items-center justify-center hover:bg-accent hover:text-accent-foreground"
                      onClick={copyEmailAddress}
                    >
                      <Copy className="size-4" />
                    </div>
                  </div>
                  {canSendEmails && (
                    <SendDialog 
                      emailId={selectedEmail.id} 
                      fromAddress={selectedEmail.address}
                      onSendSuccess={handleSendSuccess}
                    />
                  )}
                </div>
              ) : (
                t("selectEmail")
              )}
            </h2>
          </div>
          {showMessageList && selectedEmail ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <MessageListContainer
                email={selectedEmail}
                onMessageSelect={handleMessageSelect}
                onMessagePrefetch={handleMessagePrefetch}
                selectedMessageId={selectedMessageId}
                refreshTrigger={refreshTrigger}
                canSendEmails={canSendEmails}
                sendPermissionLoading={sendPermissionLoading}
              />
            </div>
          ) : (
            <div className="flex flex-1 -translate-y-6 flex-col items-center justify-center px-6 text-center text-muted-foreground">
              <Inbox className="mb-3 h-8 w-8 text-primary/40" />
              <p className="text-sm">{t("selectEmail")}</p>
            </div>
          )}
        </div>

        <div className={columnClass} style={contentColumnStyle}>
          {selectedEmail && selectedMessageId ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <MessageView
                emailId={selectedEmail.id}
                messageId={selectedMessageId}
                messageType={selectedMessageType}
                initialMessage={selectedMessagePreview ? {
                  ...selectedMessagePreview,
                  type: selectedMessageType,
                } : undefined}
                onClose={() => {
                  setSelectedMessageId(null)
                  setSelectedMessagePreview(null)
                }}
              />
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-muted-foreground">
              <MailOpen className="mb-3 h-8 w-8 text-primary/40" />
              <p className="text-sm">{t("selectMessage")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 
