import { NextResponse } from "next/server"
import { getUserId } from "@/lib/apiKey"
import {
  createExternalMailAccount,
  EXTERNAL_MAIL_PROVIDER,
  listExternalMailAccounts,
} from "@/lib/external-mail"

export const runtime = "edge"

export async function GET(request: Request) {
  const userId = await getUserId()

  if (!userId) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const emailId = searchParams.get("emailId")

  try {
    const accounts = await listExternalMailAccounts(userId)
    return NextResponse.json({
      accounts: emailId ? accounts.filter(account => account.emailId === emailId) : accounts,
    })
  } catch (error) {
    console.error("Failed to list external mail accounts:", error)
    return NextResponse.json(
      { error: "获取外部邮箱账号失败" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const userId = await getUserId()

  if (!userId) {
    return NextResponse.json({ error: "未授权" }, { status: 401 })
  }

  try {
    const body = await request.json() as {
      provider?: string
      emailAddress?: string
      username?: string
      password?: string
    }
    const provider = body.provider || EXTERNAL_MAIL_PROVIDER.ICLOUD
    const emailAddress = body.emailAddress?.trim() || ""
    const username = body.username?.trim() || emailAddress
    const password = body.password || ""

    if (provider !== EXTERNAL_MAIL_PROVIDER.ICLOUD) {
      return NextResponse.json(
        { error: "目前第一版仅支持 iCloud" },
        { status: 400 }
      )
    }

    const account = await createExternalMailAccount(userId, {
      provider: EXTERNAL_MAIL_PROVIDER.ICLOUD,
      emailAddress,
      username,
      password,
    })

    return NextResponse.json({ account })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建外部邮箱账号失败" },
      { status: error instanceof Error && error.message.includes("已经") ? 409 : 400 }
    )
  }
}
