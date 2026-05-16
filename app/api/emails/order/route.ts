import { NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { emails } from "@/lib/schema"
import { getUserId } from "@/lib/apiKey"
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm"

export const runtime = "edge"

export async function PATCH(request: Request) {
  const userId = await getUserId()

  if (!userId) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  const { emailIds, groupId } = await request.json().catch(() => ({})) as {
    emailIds?: unknown
    groupId?: unknown
  }

  if (!Array.isArray(emailIds) || !emailIds.every(id => typeof id === "string")) {
    return NextResponse.json({ error: "邮箱排序参数无效" }, { status: 400 })
  }

  const orderedEmailIds = emailIds as string[]
  const uniqueEmailIds = new Set(orderedEmailIds)
  if (uniqueEmailIds.size !== orderedEmailIds.length) {
    return NextResponse.json({ error: "邮箱排序不能包含重复项" }, { status: 400 })
  }

  const selectedGroupId = typeof groupId === "string" && groupId.trim()
    ? groupId.trim()
    : null

  const db = createDb()

  try {
    const conditions = [
      eq(emails.userId, userId),
      gt(emails.expiresAt, new Date()),
    ]

    if (selectedGroupId === "none") {
      conditions.push(isNull(emails.groupId))
    } else if (selectedGroupId) {
      conditions.push(eq(emails.groupId, selectedGroupId))
    }

    const currentEmails = await db.select({ id: emails.id })
      .from(emails)
      .where(and(...conditions))
      .orderBy(
        asc(sql`case when ${emails.sortOrder} is null then 1 else 0 end`),
        asc(emails.sortOrder),
        desc(emails.createdAt),
        desc(emails.id)
      )

    const currentEmailIds = currentEmails.map(email => email.id)
    const currentEmailIdSet = new Set(currentEmailIds)
    const hasOnlyOwnedEmails = orderedEmailIds.every(id => currentEmailIdSet.has(id))

    if (!hasOnlyOwnedEmails) {
      return NextResponse.json({ error: "邮箱排序必须包含当前列表里的邮箱" }, { status: 400 })
    }

    const nextEmailIds = [
      ...orderedEmailIds,
      ...currentEmailIds.filter(id => !uniqueEmailIds.has(id)),
    ]

    await Promise.all(nextEmailIds.map((id, index) => (
      db.update(emails)
        .set({ sortOrder: index })
        .where(and(
          eq(emails.id, id),
          eq(emails.userId, userId)
        ))
    )))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to update email order:", error)
    return NextResponse.json(
      { error: "保存邮箱排序失败" },
      { status: 500 }
    )
  }
}
