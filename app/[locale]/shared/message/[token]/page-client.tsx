"use client"

import { useTranslations } from "next-intl"
import { BrandHeader } from "@/components/ui/brand-header"
import { FloatingLanguageSwitcher } from "@/components/layout/floating-language-switcher"
import { SharedMessageDetail } from "@/components/emails/shared-message-detail"

interface MessageDetail {
  id: string
  from_address?: string
  to_address?: string
  subject: string
  content?: string
  html?: string
  received_at?: Date
  sent_at?: Date
  expiresAt?: Date
  emailAddress?: string
  emailExpiresAt?: Date
}

interface SharedMessagePageClientProps {
  message: MessageDetail
}

export function SharedMessagePageClient({ message }: SharedMessagePageClientProps) {
  const t = useTranslations("emails")

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col px-5 py-4">
        <BrandHeader
          title={message.emailAddress || message.to_address || message.subject}
          showBrand={false}
          subtitle={(() => {
            const expiresAt = message.expiresAt || message.emailExpiresAt

            if (!expiresAt) {
              return ""
            }

            const expiresDate = new Date(expiresAt)

            if (isNaN(expiresDate.getTime())) {
              return ""
            }

            return expiresDate.getFullYear() === 9999
              ? "永久有效"
              : `有效期至: ${expiresDate.toLocaleString()}`
          })()}
        />

        <div className="mt-4 grid min-h-0 flex-1 gap-4" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
          <div
            className="h-full border-2 border-primary/20 bg-background rounded-lg overflow-hidden"
            style={{ gridColumn: "span 24 / span 24" }}
          >
            <SharedMessageDetail
              message={{
                ...message,
                received_at: message.received_at ? new Date(message.received_at).getTime() : undefined,
                sent_at: message.sent_at ? new Date(message.sent_at).getTime() : undefined
              }}
              loading={false}
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
      
      <FloatingLanguageSwitcher />
    </div>
  )
}
