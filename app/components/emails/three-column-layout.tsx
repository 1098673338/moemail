"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { EmailList } from "./email-list"
import { MessageListContainer } from "./message-list-container"
import { MessageView } from "./message-view"
import { SendDialog } from "./send-dialog"
import { useCopy } from "@/hooks/use-copy"
import { useSendPermission } from "@/hooks/use-send-permission"
import { Copy, Inbox, MailOpen } from "lucide-react"

interface Email {
  id: string
  address: string
}

export function ThreeColumnLayout() {
  const t = useTranslations("emails.layout")
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [selectedMessageType, setSelectedMessageType] = useState<'received' | 'sent'>('received')
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const { copyToClipboard } = useCopy()
  const { canSend: canSendEmails } = useSendPermission()

  const columnClass = "min-h-0 border border-gray-200 bg-background rounded-lg overflow-hidden flex flex-col"
  const headerClass = "h-12 px-2 border-b border-gray-200 flex items-center justify-between shrink-0"
  const titleClass = "text-sm font-bold px-2 w-full overflow-hidden"
  const emailColumnStyle = { gridColumn: "span 4 / span 4" }
  const messageListColumnStyle = { gridColumn: "span 6 / span 6" }
  const contentColumnStyle = { gridColumn: "span 14 / span 14" }

  const copyEmailAddress = () => {
    copyToClipboard(selectedEmail?.address || "")
  }

  const handleMessageSelect = (messageId: string | null, messageType: 'received' | 'sent' = 'received') => {
    setSelectedMessageId(messageId)
    setSelectedMessageType(messageType)
  }

  const handleSendSuccess = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  return (
    <div className="flex h-full min-h-0 flex-col pb-5 pt-16">
      <div className="grid min-h-0 flex-1 gap-5" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
        <div className={columnClass} style={emailColumnStyle}>
          <div className={headerClass}>
            <h2 className={titleClass}>{t("myEmails")}</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <EmailList
              onEmailSelect={(email) => {
                setSelectedEmail(email)
                setSelectedMessageId(null)
              }}
              selectedEmailId={selectedEmail?.id}
            />
          </div>
        </div>

        <div className={columnClass} style={messageListColumnStyle}>
          <div className={headerClass}>
            <h2 className={titleClass}>
              {selectedEmail ? (
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
                  {selectedEmail && canSendEmails && (
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
          {selectedEmail ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <MessageListContainer
                email={selectedEmail}
                onMessageSelect={handleMessageSelect}
                selectedMessageId={selectedMessageId}
                refreshTrigger={refreshTrigger}
              />
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-end px-6 pb-6 text-center text-muted-foreground">
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
                onClose={() => setSelectedMessageId(null)}
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
