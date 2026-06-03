import { NextResponse } from "next/server"
import { getUserId } from "@/lib/apiKey"
import { deleteExternalMailAccount } from "@/lib/external-mail"

export const runtime = "edge"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId()
  const { id } = await params

  if (!userId) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  try {
    const deleted = await deleteExternalMailAccount(userId, id)

    return deleted
      ? NextResponse.json({ success: true })
      : NextResponse.json({ error: "iCloud 邮箱账号不存在" }, { status: 404 })
  } catch (error) {
    console.error("Failed to delete external mail account:", error)
    return NextResponse.json(
      { error: "删除 iCloud 邮箱账号失败" },
      { status: 500 }
    )
  }
}
