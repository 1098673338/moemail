import { NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { emailGroups, emails } from "@/lib/schema"
import { getUserId } from "@/lib/apiKey"
import { asc, eq, sql } from "drizzle-orm"

export const runtime = "edge"

export async function GET() {
  const userId = await getUserId()

  if (!userId) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  const db = createDb()

  try {
    const groups = await db.select({
      id: emailGroups.id,
      name: emailGroups.name,
      userId: emailGroups.userId,
      sortOrder: emailGroups.sortOrder,
      createdAt: emailGroups.createdAt,
      emailCount: sql<number>`count(${emails.id})`,
    })
      .from(emailGroups)
      .leftJoin(emails, eq(emails.groupId, emailGroups.id))
      .where(eq(emailGroups.userId, userId))
      .groupBy(emailGroups.id)
      .orderBy(asc(emailGroups.sortOrder), asc(emailGroups.createdAt), asc(emailGroups.name))

    return NextResponse.json({ groups })
  } catch (error) {
    console.error("Failed to fetch email groups:", error)
    return NextResponse.json(
      { error: "获取邮箱分组失败" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const userId = await getUserId()

  if (!userId) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  const { name } = await request.json() as { name?: string }
  const groupName = name?.trim()

  if (!groupName) {
    return NextResponse.json({ error: "分组名称不能为空" }, { status: 400 })
  }

  const db = createDb()

  try {
    const [maxSortOrderRow] = await db.select({
      sortOrder: sql<number>`coalesce(max(${emailGroups.sortOrder}), -1)`,
    })
      .from(emailGroups)
      .where(eq(emailGroups.userId, userId))

    const [group] = await db.insert(emailGroups)
      .values({
        userId,
        name: groupName,
        sortOrder: Number(maxSortOrderRow?.sortOrder ?? -1) + 1,
      })
      .returning()

    return NextResponse.json({ group: { ...group, emailCount: 0 } })
  } catch (error) {
    console.error("Failed to create email group:", error)
    return NextResponse.json(
      { error: "分组已存在或创建失败" },
      { status: 400 }
    )
  }
}
