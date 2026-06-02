import { NextResponse } from "next/server"
import { getUserId } from "@/lib/apiKey"
import { getExternalMailErrorMessage, syncExternalMailAccount } from "@/lib/external-mail"

export const runtime = "edge"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId()
  const { id } = await params

  if (!userId) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  try {
    const result = await syncExternalMailAccount(userId, id)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    console.error("Failed to sync external mail account:", error)
    const errorMessage = getExternalMailErrorMessage(
      error,
      "同步失败，请检查 iCloud App 专用密码、Apple ID 和网络连接"
    )

    return NextResponse.json(
      { error: errorMessage },
      { status: 400 }
    )
  }
}
