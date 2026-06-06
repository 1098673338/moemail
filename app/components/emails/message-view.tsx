"use client"

import { useState, useEffect, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { MessageDetailHeader } from "./message-detail-header"
import { LinkifiedText } from "./linkified-text"
import { buildHtmlDocument } from "./html-message-document"

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
  emailAddress: string
  messageId: string
  messageType?: 'received' | 'sent'
  initialMessage?: Message
  onClose: () => void
}

const messageCache = new Map<string, Message>()
const messageRequestCache = new Map<string, Promise<Message>>()
const MESSAGE_CACHE_DB_NAME = "moemail-message-cache"
const MESSAGE_CACHE_DB_VERSION = 1
const MESSAGE_CACHE_STORE_NAME = "messages"
const MESSAGE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000
const MESSAGE_CACHE_MAX_ENTRIES = 100
const HTML_RENDER_IDLE_TIMEOUT = 300

interface StoredMessage {
  key: string
  savedAt: number
  message: Message
}

let messageCacheDbPromise: Promise<IDBDatabase | null> | null = null

const getMessageCacheKey = (
  emailId: string,
  messageId: string,
  messageType: 'received' | 'sent' = 'received'
) => `${emailId}:${messageType}:${messageId}`

const hasMessageBody = (message: Message | null) => {
  return typeof message?.content === "string" || typeof message?.html === "string"
}

const pruneMemoryCache = () => {
  while (messageCache.size > MESSAGE_CACHE_MAX_ENTRIES) {
    const oldestKey = messageCache.keys().next().value as string | undefined
    if (!oldestKey) return
    messageCache.delete(oldestKey)
  }
}

const canUseStoredCache = () => {
  try {
    return typeof window !== "undefined" && typeof window.indexedDB !== "undefined"
  } catch {
    return false
  }
}

const requestToPromise = <T,>(request: IDBRequest<T>) => {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const transactionDone = (transaction: IDBTransaction) => {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

const openMessageCacheDb = () => {
  if (!canUseStoredCache()) return Promise.resolve(null)

  if (!messageCacheDbPromise) {
    messageCacheDbPromise = new Promise<IDBDatabase | null>((resolve) => {
      const request = window.indexedDB.open(MESSAGE_CACHE_DB_NAME, MESSAGE_CACHE_DB_VERSION)

      request.onupgradeneeded = () => {
        const db = request.result
        const store = db.objectStoreNames.contains(MESSAGE_CACHE_STORE_NAME)
          ? request.transaction?.objectStore(MESSAGE_CACHE_STORE_NAME)
          : db.createObjectStore(MESSAGE_CACHE_STORE_NAME, { keyPath: "key" })

        if (store && !store.indexNames.contains("savedAt")) {
          store.createIndex("savedAt", "savedAt")
        }
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    })
  }

  return messageCacheDbPromise
}

const pruneStoredCache = async () => {
  const db = await openMessageCacheDb()
  if (!db) return

  try {
    const readTransaction = db.transaction(MESSAGE_CACHE_STORE_NAME, "readonly")
    const allMessages = await requestToPromise<StoredMessage[]>(
      readTransaction.objectStore(MESSAGE_CACHE_STORE_NAME).getAll()
    )
    const now = Date.now()
    const sortedMessages = allMessages
      .filter(item => item?.key && item?.savedAt)
      .sort((a, b) => b.savedAt - a.savedAt)
    const keysToDelete = sortedMessages
      .filter((item, index) => index >= MESSAGE_CACHE_MAX_ENTRIES || now - item.savedAt > MESSAGE_CACHE_TTL)
      .map(item => item.key)

    if (keysToDelete.length === 0) return

    const writeTransaction = db.transaction(MESSAGE_CACHE_STORE_NAME, "readwrite")
    const store = writeTransaction.objectStore(MESSAGE_CACHE_STORE_NAME)
    keysToDelete.forEach(key => store.delete(key))
    await transactionDone(writeTransaction)
  } catch {
    // IndexedDB cache pruning is best-effort.
  }
}

const deleteStoredMessage = async (cacheKey: string) => {
  const db = await openMessageCacheDb()
  if (!db) return

  try {
    const transaction = db.transaction(MESSAGE_CACHE_STORE_NAME, "readwrite")
    transaction.objectStore(MESSAGE_CACHE_STORE_NAME).delete(cacheKey)
    await transactionDone(transaction)
  } catch {
    // Ignore cache delete failures.
  }
}

const readStoredMessage = async (cacheKey: string) => {
  const db = await openMessageCacheDb()
  if (!db) return null

  try {
    const transaction = db.transaction(MESSAGE_CACHE_STORE_NAME, "readonly")
    const stored = await requestToPromise<StoredMessage | undefined>(
      transaction.objectStore(MESSAGE_CACHE_STORE_NAME).get(cacheKey)
    )

    if (!stored?.savedAt || !stored.message || Date.now() - stored.savedAt > MESSAGE_CACHE_TTL) {
      void deleteStoredMessage(cacheKey)
      void pruneStoredCache()
      return null
    }

    return hasMessageBody(stored.message) ? stored.message : null
  } catch {
    return null
  }
}

const writeStoredMessage = async (cacheKey: string, message: Message) => {
  if (!canUseStoredCache() || !hasMessageBody(message)) return

  try {
    const db = await openMessageCacheDb()
    if (!db) return

    const transaction = db.transaction(MESSAGE_CACHE_STORE_NAME, "readwrite")
    transaction.objectStore(MESSAGE_CACHE_STORE_NAME).put({
      key: cacheKey,
      savedAt: Date.now(),
      message,
    } satisfies StoredMessage)
    await transactionDone(transaction)
    void pruneStoredCache()
  } catch {
    // Ignore persistent-cache failures.
  }
}

const cacheMessage = (
  emailId: string,
  messageId: string,
  messageType: 'received' | 'sent',
  message: Message
) => {
  const cacheKey = getMessageCacheKey(emailId, messageId, messageType)
  const currentMessage = messageCache.get(cacheKey)
  const definedFields = Object.fromEntries(
    Object.entries(message).filter(([, value]) => value !== undefined)
  ) as Message
  const nextMessage = {
    ...currentMessage,
    ...definedFields,
  }

  if (currentMessage) {
    messageCache.delete(cacheKey)
  }

  messageCache.set(cacheKey, nextMessage)
  pruneMemoryCache()

  if (hasMessageBody(nextMessage)) {
    void writeStoredMessage(cacheKey, nextMessage)
  }

  return nextMessage
}

export async function prefetchMessage(
  emailId: string,
  messageId: string,
  messageType: 'received' | 'sent' = 'received',
  initialMessage?: Message
) {
  const cacheKey = getMessageCacheKey(emailId, messageId, messageType)
  const cachedMessage = initialMessage
    ? cacheMessage(emailId, messageId, messageType, initialMessage)
    : messageCache.get(cacheKey)

  if (cachedMessage && hasMessageBody(cachedMessage)) return cachedMessage

  const existingRequest = messageRequestCache.get(cacheKey)
  if (existingRequest) return existingRequest

  const request = (async () => {
    const storedMessage = await readStoredMessage(cacheKey)
    if (storedMessage) {
      const restoredMessage = cacheMessage(emailId, messageId, messageType, storedMessage)
      return initialMessage
        ? cacheMessage(emailId, messageId, messageType, initialMessage)
        : restoredMessage
    }

    const response = await fetch(`/api/emails/${emailId}/${messageId}${messageType === 'sent' ? '?type=sent' : ''}`)

    if (!response.ok) {
      const errorData = await response.json().catch(() => null) as { error?: string } | null
      throw new Error(errorData?.error || "Failed to load message")
    }

    const data = await response.json() as { message: Message }
    return cacheMessage(emailId, messageId, messageType, data.message)
  })().finally(() => {
    messageRequestCache.delete(cacheKey)
  })

  messageRequestCache.set(cacheKey, request)
  return request
}

export function MessageView({ emailId, emailAddress, messageId, messageType = 'received', initialMessage }: MessageViewProps) {
  const t = useTranslations("emails.messageView")
  const cacheKey = getMessageCacheKey(emailId, messageId, messageType)
  const cachedInitialMessage = messageCache.get(cacheKey)
  const firstMessage = cachedInitialMessage ?? initialMessage ?? null
  const [message, setMessage] = useState<Message | null>(firstMessage)
  const [loading, setLoading] = useState(!hasMessageBody(firstMessage))
  const [error, setError] = useState<string | null>(null)
  const [htmlReady, setHtmlReady] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const cacheKey = getMessageCacheKey(emailId, messageId, messageType)
    const cachedMessage = messageCache.get(cacheKey)
    const nextInitialMessage = cachedMessage ?? initialMessage ?? null
    let cancelled = false

    setError(null)
    setMessage(nextInitialMessage)

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

  useEffect(() => {
    setHtmlReady(false)

    if (!message?.html) return

    let cancelled = false
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
      cancelIdleCallback?: (handle: number) => void
    }
    const markReady = () => {
      if (!cancelled) {
        setHtmlReady(true)
      }
    }

    if (typeof idleWindow.requestIdleCallback === "function") {
      const idleHandle = idleWindow.requestIdleCallback(markReady, { timeout: HTML_RENDER_IDLE_TIMEOUT })

      return () => {
        cancelled = true
        idleWindow.cancelIdleCallback?.(idleHandle)
      }
    }

    const frameHandle = window.requestAnimationFrame(markReady)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frameHandle)
    }
  }, [message?.html, message?.id])

  const htmlDocument = useMemo(() => {
    if (!htmlReady || !message?.html) return undefined
    return buildHtmlDocument(message.html)
  }, [htmlReady, message?.html])

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
        fromAddress={message.from_address || (isSentMessage ? emailAddress : undefined)}
        toAddress={message.to_address || (!isSentMessage ? emailAddress : undefined)}
      />
      
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
        ) : message.html ? (
          htmlDocument ? (
            <iframe
              srcDoc={htmlDocument}
              className="absolute inset-0 w-full h-full border-0 bg-transparent"
              sandbox="allow-same-origin allow-popups"
              title={message.subject}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-gray-500">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary/40" />
              <p>{t("loading")}</p>
            </div>
          )
        ) : (
          <div className="p-4 text-sm whitespace-pre-wrap">
            <LinkifiedText text={message.content || ""} />
          </div>
        )}
      </div>
    </div>
  )
} 
