import { NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { emailGroups, emails } from "@/lib/schema"
import { getUserId } from "@/lib/apiKey"
import { and, eq } from "drizzle-orm"

export const runtime = "edge"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const { id } = await params

  try {
    const group = await db.query.emailGroups.findFirst({
      where: and(
        eq(emailGroups.id, id),
        eq(emailGroups.userId, userId)
      )
    })

    if (!group) {
      return NextResponse.json(
        { error: "分组不存在或无权限操作" },
        { status: 404 }
      )
    }

    const [updatedGroup] = await db.update(emailGroups)
      .set({ name: groupName })
      .where(eq(emailGroups.id, id))
      .returning()

    return NextResponse.json({ group: updatedGroup })
  } catch (error) {
    console.error("Failed to update email group:", error)
    return NextResponse.json(
      { error: "分组已存在或修改失败" },
      { status: 400 }
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId()

  if (!userId) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  const db = createDb()
  const { id } = await params

  try {
    const group = await db.query.emailGroups.findFirst({
      where: and(
        eq(emailGroups.id, id),
        eq(emailGroups.userId, userId)
      )
    })

    if (!group) {
      return NextResponse.json(
        { error: "分组不存在或无权限操作" },
        { status: 404 }
      )
    }

    await db.update(emails)
      .set({ groupId: null })
      .where(and(
        eq(emails.groupId, id),
        eq(emails.userId, userId)
      ))

    await db.delete(emailGroups)
      .where(eq(emailGroups.id, id))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete email group:", error)
    return NextResponse.json(
      { error: "删除分组失败" },
      { status: 500 }
    )
  }
}
