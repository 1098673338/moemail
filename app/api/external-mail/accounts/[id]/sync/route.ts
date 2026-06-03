import { NextResponse } from "next/server"
import { getUserId } from "@/lib/apiKey"
import { EXTERNAL_MAIL_AUTO_SYNC_LIMIT, getExternalMailErrorMessage, syncExternalMailAccount } from "@/lib/external-mail"

export const runtime = "edge"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId()
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const rescan = searchParams.get("rescan") === "1"
  const recentLimitValue = Number(searchParams.get("recentLimit") || "")
  const recentLimit = Number.isInteger(recentLimitValue) && recentLimitValue > 0
    ? Math.min(recentLimitValue, EXTERNAL_MAIL_AUTO_SYNC_LIMIT)
    : undefined

  if (!userId) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  try {
    const result = await syncExternalMailAccount(userId, id, { rescan, recentLimit })

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
