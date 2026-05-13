import { NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { emailGroups } from "@/lib/schema"
import { getUserId } from "@/lib/apiKey"
import { eq } from "drizzle-orm"

export const runtime = "edge"

export async function GET() {
  const userId = await getUserId()

  if (!userId) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  const db = createDb()

  try {
    const groups = await db.query.emailGroups.findMany({
      where: eq(emailGroups.userId, userId),
      orderBy: (emailGroups, { asc }) => [
        asc(emailGroups.createdAt),
        asc(emailGroups.name),
      ],
    })

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
    const [group] = await db.insert(emailGroups)
      .values({
        userId,
        name: groupName,
      })
      .returning()

    return NextResponse.json({ group })
  } catch (error) {
    console.error("Failed to create email group:", error)
    return NextResponse.json(
      { error: "分组已存在或创建失败" },
      { status: 400 }
    )
  }
}
