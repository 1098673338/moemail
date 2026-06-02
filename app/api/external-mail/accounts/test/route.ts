import { NextResponse } from "next/server"
import { getUserId } from "@/lib/apiKey"
import { getExternalMailErrorMessage, testIcloudConnection } from "@/lib/external-mail"

export const runtime = "edge"

export async function POST(request: Request) {
  const userId = await getUserId()

  if (!userId) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  try {
    const body = await request.json() as {
      username?: string
      password?: string
    }
    const username = body.username?.trim() || ""
    const password = body.password || ""

    await testIcloudConnection({ username, password })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to test external mail account:", error)
    const errorMessage = getExternalMailErrorMessage(
      error,
      "连接测试失败，请检查 iCloud App 专用密码、Apple ID 和网络连接"
    )

    return NextResponse.json(
      { error: errorMessage },
      { status: 400 }
    )
  }
}
