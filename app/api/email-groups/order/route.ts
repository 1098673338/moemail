import { NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { emailGroups } from "@/lib/schema"
import { getUserId } from "@/lib/apiKey"
import { and, eq } from "drizzle-orm"

export const runtime = "edge"

export async function PATCH(request: Request) {
  const userId = await getUserId()

  if (!userId) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  const { groupIds } = await request.json().catch(() => ({})) as {
    groupIds?: unknown
  }

  if (!Array.isArray(groupIds) || !groupIds.every(id => typeof id === "string")) {
    return NextResponse.json({ error: "分组排序参数无效" }, { status: 400 })
  }

  const orderedGroupIds = groupIds as string[]
  const uniqueGroupIds = new Set(orderedGroupIds)
  if (uniqueGroupIds.size !== orderedGroupIds.length) {
    return NextResponse.json({ error: "分组排序不能包含重复项" }, { status: 400 })
  }

  const db = createDb()

  try {
    const groups = await db.select({ id: emailGroups.id })
      .from(emailGroups)
      .where(eq(emailGroups.userId, userId))

    const ownedGroupIds = new Set(groups.map(group => group.id))
    const hasCompleteOrder = orderedGroupIds.length === groups.length
      && orderedGroupIds.every(id => ownedGroupIds.has(id))

    if (!hasCompleteOrder) {
      return NextResponse.json({ error: "分组排序必须包含当前用户的全部分组" }, { status: 400 })
    }

    await Promise.all(orderedGroupIds.map((id, index) => (
      db.update(emailGroups)
        .set({ sortOrder: index })
        .where(and(
          eq(emailGroups.id, id),
          eq(emailGroups.userId, userId)
        ))
    )))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to update email group order:", error)
    return NextResponse.json(
      { error: "保存分组排序失败" },
      { status: 500 }
    )
  }
}
