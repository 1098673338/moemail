import { NextResponse } from "next/server"
import { getUserId } from "@/lib/apiKey"
import {
  deleteExternalMailAccount,
  getExternalMailErrorMessage,
  updateExternalMailCredentials,
} from "@/lib/external-mail"

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId()
  const { id } = await params

  if (!userId) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  try {
    const body = await request.json() as {
      username?: string
      password?: string
    }
    const account = await updateExternalMailCredentials(userId, id, {
      username: body.username?.trim() || "",
      password: body.password || "",
    })

    return NextResponse.json({ account })
  } catch (error) {
    console.error("Failed to update external mail credentials:", error)
    const errorMessage = getExternalMailErrorMessage(
      error,
      "更新凭据失败，请检查 iCloud App 专用密码、Apple ID 和网络连接"
    )

    return NextResponse.json(
      { error: errorMessage },
      { status: error instanceof Error && error.message.includes("不存在") ? 404 : 400 }
    )
  }
}
