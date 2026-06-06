import { createDb } from "@/lib/db"
import { emailShares, externalMailAccounts, messages } from "@/lib/schema"
import { eq, and, lt, or, sql, ne, isNull } from "drizzle-orm"
import { NextResponse } from "next/server"
import { encodeCursor, decodeCursor } from "@/lib/cursor"
import {
  backfillExternalAliasMessagesForEmail,
  EXTERNAL_MAIL_AUTO_SYNC_LIMIT,
  syncExternalMailAccount,
  syncExternalMailAccountByEmailId,
} from "@/lib/external-mail"

export const runtime = "edge"

const PAGE_SIZE = 20

// 通过分享token获取邮箱的消息列表
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const db = createDb()
  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor')
  const messageType = searchParams.get('type') === 'sent' ? 'sent' : 'received'
  const countOnly = searchParams.get('countOnly') === '1'
  const shouldSync = messageType === 'received' && searchParams.get('sync') === '1' && !cursor
  const rescan = searchParams.get('rescan') === '1'
  const recentLimitValue = Number(searchParams.get('recentLimit') || "")
  const recentLimit = Number.isInteger(recentLimitValue) && recentLimitValue > 0
    ? Math.min(recentLimitValue, EXTERNAL_MAIL_AUTO_SYNC_LIMIT)
    : undefined

  try {
    // 验证分享token
    const share = await db.query.emailShares.findFirst({
      where: eq(emailShares.token, token),
      with: {
        email: true
      }
    })

    if (!share) {
      return NextResponse.json(
        { error: "Share link not found or expired" },
        { status: 404 }
      )
    }

    // 检查分享是否过期
    if (share.expiresAt && share.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Share link has expired" },
        { status: 410 }
      )
    }

    // 检查邮箱是否过期
    if (share.email.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Email has expired" },
        { status: 410 }
      )
    }

    const emailId = share.email.id

    if (shouldSync && share.email.isCustom && share.email.userId) {
      const accounts = await db.query.externalMailAccounts.findMany({
        where: and(
          eq(externalMailAccounts.userId, share.email.userId),
          eq(externalMailAccounts.provider, "icloud"),
          eq(externalMailAccounts.enabled, true)
        ),
        columns: {
          id: true,
        },
      })

      await Promise.all(accounts.map(account => (
        syncExternalMailAccount(share.email.userId!, account.id, { rescan, recentLimit }).catch((error) => {
          console.error("Failed to sync shared custom external mail account:", error)
        })
      )))
    } else if (shouldSync) {
      await syncExternalMailAccountByEmailId(emailId, { rescan, recentLimit }).catch((error) => {
        console.error("Failed to sync shared external mail account:", error)
      })
    }

    if (share.email.isCustom) {
      await backfillExternalAliasMessagesForEmail(db, share.email)
    }

    const baseConditions = messageType === 'sent'
      ? and(
          eq(messages.emailId, emailId),
          eq(messages.type, "sent")
        )
      : and(
          eq(messages.emailId, emailId),
          or(
            ne(messages.type, "sent"),
            isNull(messages.type)
          )
        )

    const totalResult = await db.select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(baseConditions)
    const totalCount = Number(totalResult[0].count)

    if (countOnly) {
      return NextResponse.json({ total: totalCount })
    }

    const conditions = [baseConditions]
    const timestampColumn = messageType === 'sent' ? messages.sentAt : messages.receivedAt

    if (cursor) {
      const { timestamp, id } = decodeCursor(cursor)
      const cursorCondition = or(
        lt(timestampColumn, new Date(timestamp)),
        and(
          eq(timestampColumn, new Date(timestamp)),
          lt(messages.id, id)
        )
      )
      if (cursorCondition) {
        conditions.push(cursorCondition)
      }
    }

    const results = await db.query.messages.findMany({
      where: and(...conditions),
      orderBy: messageType === 'sent'
        ? (messages, { desc }) => [desc(messages.sentAt), desc(messages.id)]
        : (messages, { desc }) => [desc(messages.receivedAt), desc(messages.id)],
      limit: PAGE_SIZE + 1
    })

    const hasMore = results.length > PAGE_SIZE
    const nextCursor = hasMore
      ? encodeCursor(
          (messageType === 'sent'
            ? results[PAGE_SIZE - 1].sentAt
            : results[PAGE_SIZE - 1].receivedAt
          ).getTime(),
          results[PAGE_SIZE - 1].id
        )
      : null
    const messageList = hasMore ? results.slice(0, PAGE_SIZE) : results

    return NextResponse.json({
      messages: messageList.map(msg => ({
        id: msg.id,
        from_address: msg.fromAddress,
        to_address: msg.toAddress,
        subject: msg.subject,
        received_at: msg.receivedAt,
        sent_at: msg.sentAt,
        type: msg.type as "received" | "sent" | undefined
      })),
      nextCursor,
      total: totalCount
    })
  } catch (error) {
    console.error("Failed to fetch shared messages:", error)
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    )
  }
}
