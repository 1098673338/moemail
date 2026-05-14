"use client"

import { Loader2, Mail, MailX, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { useThrottle } from "@/hooks/use-throttle"
import { Button } from "@/components/ui/button"

interface Message {
  id: string
  from_address?: string
  to_address?: string
  subject: string
  received_at?: number
  sent_at?: number
}

interface SharedMessageListProps {
  messages: Message[]
  selectedMessageId?: string | null
  onMessageSelect: (message: Message) => void
  onMessagePrefetch?: (message: Message) => void
  onLoadMore?: () => void
  onRefresh?: () => void
  loading?: boolean
  loadingMore?: boolean
  refreshing?: boolean
  hasMore?: boolean
  total?: number
  emptyStateOffsetClass?: string
  t: {
    received: string
    noMessages: string
    messageCount: string
    loading: string
    loadingMore: string
  }
}

export function SharedMessageList({
  messages,
  selectedMessageId,
  onMessageSelect,
  onMessagePrefetch,
  onLoadMore,
  onRefresh,
  loading = false,
  loadingMore = false,
  refreshing = false,
  hasMore = false,
  total = 0,
  emptyStateOffsetClass = "-translate-y-6",
  t,
}: SharedMessageListProps) {
  const handleScroll = useThrottle((e: React.UIEvent<HTMLDivElement>) => {
    if (loadingMore || !hasMore || !onLoadMore) return

    const { scrollHeight, scrollTop, clientHeight } = e.currentTarget
    const threshold = clientHeight * 1.5
    const remainingScroll = scrollHeight - scrollTop

    if (remainingScroll <= threshold) {
      onLoadMore()
    }
  }, 200)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 px-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          disabled={refreshing || loading}
          className={cn("h-8 w-8", refreshing && "animate-spin")}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
        <span className="text-xs text-gray-500">
          {total > 0 ? `${total} ${t.messageCount}` : t.noMessages}
        </span>
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-auto p-2",
          (loading || messages.length === 0) && "flex"
        )}
        onScroll={handleScroll}
      >
        {loading ? (
          <div className={cn("flex flex-1 flex-col items-center justify-center px-6 text-center text-sm text-gray-500", emptyStateOffsetClass)}>
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary/40" />
            <p>{t.loading}</p>
          </div>
        ) : messages.length > 0 ? (
          <div className="space-y-1">
            {messages.map((message) => (
              <div
                key={message.id}
                onClick={() => {
                  if (selectedMessageId !== message.id) {
                    onMessageSelect(message)
                  }
                }}
                onFocus={() => onMessagePrefetch?.(message)}
                onMouseEnter={() => onMessagePrefetch?.(message)}
                tabIndex={0}
                className={cn(
                  "py-2 px-3 rounded cursor-pointer",
                  selectedMessageId === message.id
                    ? "bg-gray-200"
                    : "hover:bg-gray-100"
                )}
              >
                <div className="flex items-start gap-3">
                  <Mail className="w-4 h-4 text-primary/60 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">
                      {message.subject}
                    </p>
                    <p className="mt-1 truncate text-left text-xs text-gray-500">
                      {message.from_address || message.to_address || ""}
                    </p>
                    <p className="mt-1 text-left text-xs text-gray-500">
                      {new Date(
                        message.received_at || message.sent_at || 0
                      ).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {loadingMore && (
              <div className="text-center text-sm text-gray-500 py-2">
                {t.loadingMore}
              </div>
            )}
          </div>
        ) : (
          <div className={cn("flex flex-1 flex-col items-center justify-center px-6 text-center text-muted-foreground", emptyStateOffsetClass)}>
            <MailX className="mb-3 h-8 w-8 text-primary/40" />
            <p className="text-sm">{t.noMessages}</p>
          </div>
        )}
      </div>
    </div>
  )
}
