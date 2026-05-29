import { NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { emailGroups, emails, messages } from "@/lib/schema"
import { eq, and, lt, or, sql, ne, isNull, desc, gt } from "drizzle-orm"
import { encodeCursor, decodeCursor } from "@/lib/cursor"
import { getUserId } from "@/lib/apiKey"
import { checkBasicSendPermission } from "@/lib/send-permissions"
import { EXPIRY_OPTIONS } from "@/types/email"

export const runtime = "edge"

const MAX_TAG_LENGTH = 32

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId()

  try {
    const db = createDb()
    const { id } = await params
    const email = await db.query.emails.findFirst({
      where: and(
        eq(emails.id, id),
        eq(emails.userId, userId!)
      )
    })

    if (!email) {
      return NextResponse.json(
        { error: "邮箱不存在或无权限删除" },
        { status: 403 }
      )
    }
    await db.delete(messages)
      .where(eq(messages.emailId, id))

    await db.delete(emails)
      .where(eq(emails.id, id))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete email:', error)
    return NextResponse.json(
      { error: "删除邮箱失败" },
      { status: 500 }
    )
  }
} 

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId()

  if (!userId) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  try {
    const db = createDb()
    const { id } = await params
    const body = await request.json() as {
      address?: string
      expiryTime?: number
      groupId?: string | null
      tag?: string | null
    }
    const hasAddress = "address" in body
    const hasGroupId = "groupId" in body
    const hasExpiryTime = "expiryTime" in body
    const hasTag = "tag" in body

    const email = await db.query.emails.findFirst({
      where: and(
        eq(emails.id, id),
        eq(emails.userId, userId)
      )
    })

    if (!email) {
      return NextResponse.json(
        { error: "邮箱不存在或无权限操作" },
        { status: 403 }
      )
    }

    const selectedGroupId = hasGroupId && typeof body.groupId === "string" && body.groupId.trim()
      ? body.groupId.trim()
      : null

    if (selectedGroupId) {
      const group = await db.query.emailGroups.findFirst({
        where: and(
          eq(emailGroups.id, selectedGroupId),
          eq(emailGroups.userId, userId)
        )
      })

      if (!group) {
        return NextResponse.json(
          { error: "分组不存在或无权限使用" },
          { status: 404 }
        )
      }
    }

    const updateData: Partial<typeof emails.$inferInsert> = {}

    if (hasAddress && email.isCustom) {
      const nextAddress = typeof body.address === "string" ? body.address : ""

      if (nextAddress.length === 0) {
        return NextResponse.json(
          { error: "请输入自定义邮箱" },
          { status: 400 }
        )
      }

      const existingEmail = await db.query.emails.findFirst({
        where: and(
          eq(sql`LOWER(${emails.address})`, nextAddress.toLowerCase()),
          ne(emails.id, id)
        )
      })

      if (existingEmail) {
        return NextResponse.json(
          { error: "已经有这个邮箱地址了，请换一个名称或域名" },
          { status: 409 }
        )
      }

      updateData.address = nextAddress
    }

    if (hasGroupId) {
      updateData.groupId = selectedGroupId

      if ((email.groupId ?? null) !== selectedGroupId) {
        const targetGroupConditions = [
          eq(emails.userId, userId),
          gt(emails.expiresAt, new Date()),
        ]

        if (selectedGroupId) {
          targetGroupConditions.push(eq(emails.groupId, selectedGroupId))
        } else {
          targetGroupConditions.push(isNull(emails.groupId))
        }

        const [minSortOrderRow] = await db.select({
          sortOrder: sql<number>`coalesce(min(${emails.sortOrder}), 0)`,
        })
          .from(emails)
          .where(and(...targetGroupConditions))

        updateData.sortOrder = Number(minSortOrderRow?.sortOrder ?? 0) - 1
      }
    }

    if (hasTag) {
      const normalizedTag = typeof body.tag === "string" && body.tag.trim()
        ? body.tag.trim()
        : null

      if (normalizedTag && normalizedTag.length > MAX_TAG_LENGTH) {
        return NextResponse.json(
          { error: `标签不能超过 ${MAX_TAG_LENGTH} 个字符` },
          { status: 400 }
        )
      }

      updateData.tag = normalizedTag
    }

    if (hasExpiryTime && !email.isCustom) {
      if (!EXPIRY_OPTIONS.some(option => option.value === body.expiryTime)) {
        return NextResponse.json(
          { error: "无效的过期时间" },
          { status: 400 }
        )
      }

      updateData.expiresAt = body.expiryTime === 0
        ? new Date("9999-01-01T00:00:00.000Z")
        : new Date(Date.now() + body.expiryTime!)
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: true, email })
    }

    await db.update(emails)
      .set(updateData)
      .where(eq(emails.id, id))

    const updatedEmail = await db.query.emails.findFirst({
      where: eq(emails.id, id)
    })

    return NextResponse.json({ success: true, email: updatedEmail })
  } catch (error) {
    console.error("Failed to update email:", error)
    return NextResponse.json(
      { error: "更新邮箱失败" },
      { status: 500 }
    )
  }
}

const PAGE_SIZE = 20

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(request.url)
  const cursorStr = searchParams.get('cursor')
  const messageType = searchParams.get('type')
  const summaryOnly = searchParams.get('summary') === '1' || searchParams.get('summary') === 'true'
  const countOnly = searchParams.get('countOnly') === '1' || searchParams.get('countOnly') === 'true'

  try {
    const db = createDb()
    const { id } = await params

    const userId = await getUserId()

    const email = await db.query.emails.findFirst({
      where: and(
        eq(emails.id, id),
        eq(emails.userId, userId!)
      )
    })

    if (!email) {
      return NextResponse.json(
        { error: "无权限查看" },
        { status: 403 }
      )
    }

    if (email.isCustom) {
      return NextResponse.json({
        messages: [],
        nextCursor: null,
        total: 0
      })
    }

    if (messageType === 'sent') {
      const permissionResult = await checkBasicSendPermission(userId!)
      if (!permissionResult.canSend) {
        return NextResponse.json(
          { error: permissionResult.error || "您没有查看发送邮件的权限" },
          { status: 403 }
        )
      }
    }

    const baseConditions = and(
      eq(messages.emailId, id),
      messageType === 'sent' 
        ? eq(messages.type, "sent") 
        : or(
            ne(messages.type, "sent"),
            isNull(messages.type)
          )
    )

    const totalResult = await db.select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(baseConditions)
    const totalCount = Number(totalResult[0].count)

    if (countOnly) {
      return NextResponse.json({
        messages: [],
        nextCursor: null,
        total: totalCount
      })
    }

    const conditions = [baseConditions]

    if (cursorStr) {
      const { timestamp, id } = decodeCursor(cursorStr)
      const orderByTime = messageType === 'sent' ? messages.sentAt : messages.receivedAt
      conditions.push(
        or(
          lt(orderByTime, new Date(timestamp)),
          and(
            eq(orderByTime, new Date(timestamp)),
            lt(messages.id, id)
          )
        )
      )
    }

    const orderByTime = messageType === 'sent' ? messages.sentAt : messages.receivedAt
    const summaryFields = {
      id: messages.id,
      fromAddress: messages.fromAddress,
      toAddress: messages.toAddress,
      subject: messages.subject,
      type: messages.type,
      sentAt: messages.sentAt,
      receivedAt: messages.receivedAt,
    }

    const results = summaryOnly
      ? await db
          .select(summaryFields)
          .from(messages)
          .where(and(...conditions))
          .orderBy(desc(orderByTime), desc(messages.id))
          .limit(PAGE_SIZE + 1)
      : await db
          .select({
            ...summaryFields,
            content: messages.content,
            html: messages.html,
          })
          .from(messages)
          .where(and(...conditions))
          .orderBy(desc(orderByTime), desc(messages.id))
          .limit(PAGE_SIZE + 1)
    
    const hasMore = results.length > PAGE_SIZE
    const nextCursor = hasMore 
      ? encodeCursor(
          messageType === 'sent' 
            ? results[PAGE_SIZE - 1].sentAt!.getTime()
            : results[PAGE_SIZE - 1].receivedAt.getTime(),
          results[PAGE_SIZE - 1].id
        )
      : null
    const messageList = hasMore ? results.slice(0, PAGE_SIZE) : results

    return NextResponse.json({ 
      messages: messageList.map(msg => {
        const message = {
          id: msg.id,
          from_address: msg?.fromAddress,
          to_address: msg?.toAddress,
          subject: msg.subject,
          sent_at: msg.sentAt?.getTime(),
          received_at: msg.receivedAt?.getTime(),
          type: msg.type as 'received' | 'sent' | undefined,
        }

        if (summaryOnly) return message

        const fullMessage = msg as typeof messages.$inferSelect
        return {
          ...message,
          content: fullMessage.content,
          html: fullMessage.html,
        }
      }),
      nextCursor,
      total: totalCount
    })
  } catch (error) {
    console.error('Failed to fetch messages:', error)
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    )
  }
} 
